/**
 * mcp.maproll.io — the maproll MCP server's own edge.
 *
 * Today it serves one route, /places, which fronts the Supabase
 * `search_locations` RPC. Two reasons it exists rather than the MCP server
 * calling Supabase directly:
 *
 *   1. No credential ships to clients. A stdio server runs on the user's
 *      machine; anything it holds, they hold.
 *   2. The backing store stays swappable. Published npm packages are pinned
 *      by whoever installed them, so a change of location data must not
 *      require every user to upgrade.
 *
 * The streamable-HTTP MCP transport lands here later; the shape is deliberate.
 */

import { KEY_TTL_DAYS, keyRecord, mintKey } from "./keys";
import { extractBearer, verifySupabaseJwt } from "./jwt";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Signs API keys. The render API verifies with the same secret. */
  MAPROLL_KEY_SECRET: string;
  /** Writes to api_keys on the caller's behalf; RLS forbids client inserts. */
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type LocationKind = "country" | "region" | "city" | "airport";

const KINDS: readonly LocationKind[] = ["country", "region", "city", "airport"];

interface RpcRow {
  type: LocationKind;
  code: string | null;
  name: string;
  country_iso: string;
  country_name: string;
  region_iso: string | null;
  region_name: string | null;
  lat: number | string | null;
  lng: number | string | null;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Place lookups are stable; let the edge absorb the repeats.
      "cache-control": status === 200 ? "public, max-age=86400" : "no-store",
      "access-control-allow-origin": "*",
    },
  });

/** Postgres numeric arrives as a string over PostgREST to keep precision. */
function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") return json({ ok: true });

    if (url.pathname === "/keys") return handleKeys(request, env, url);

    if (url.pathname !== "/places") {
      return json({ error: "not_found", message: `No route for ${url.pathname}.` }, 404);
    }

    const query = (url.searchParams.get("q") ?? "").trim();
    if (query.length < 2) {
      return json(
        { error: "invalid_query", message: "Pass ?q= with at least 2 characters." },
        400,
      );
    }

    const kind = url.searchParams.get("kind");
    if (kind && !KINDS.includes(kind as LocationKind)) {
      return json(
        {
          error: "invalid_kind",
          message: `Unknown kind "${kind}". Use one of: ${KINDS.join(", ")}.`,
        },
        400,
      );
    }

    const limitRaw = Number(url.searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 25)
      : 10;

    // `types` is omitted rather than sent as null: an explicit JSON null
    // disables every type branch in the RPC, since function defaults do not
    // apply to arguments that were actually supplied.
    const args: Record<string, unknown> = { q: query, lang: "en", result_limit: limit };
    if (kind) args.types = [kind];

    let rows: RpcRow[];
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/search_locations`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        return json(
          { error: "upstream_error", message: `Location search failed (${res.status}).` },
          502,
        );
      }
      rows = (await res.json()) as RpcRow[];
    } catch {
      return json(
        { error: "upstream_unreachable", message: "Location search is unavailable." },
        502,
      );
    }

    return json({
      query,
      places: (rows ?? []).map((r) => ({
        name: r.name,
        kind: r.type,
        // Countries: ISO 3166-1 alpha-2. Regions: ISO 3166-2. Airports: IATA.
        // This is the id `create_map` and `add_layers` want.
        id: r.code,
        lat: toNumber(r.lat),
        lon: toNumber(r.lng),
        country: r.country_name,
        countryId: r.country_iso,
        region: r.region_name,
        regionId: r.region_iso,
      })),
    });
  },
};


// --- API keys -------------------------------------------------------------
//
// Minting lives here rather than in the browser because it needs the signing
// secret, and here rather than in the render API because that repo holds no
// database. The editor calls this with the user's Supabase access token.

async function handleKeys(request: Request, env: Env, url: URL): Promise<Response> {
  const token = extractBearer(request);
  if (!token) return json({ error: "unauthorized", message: "Sign in first." }, 401);

  const user = await verifySupabaseJwt(token, env.SUPABASE_URL);
  if (!user) {
    return json(
      { error: "unauthorized", message: "Your session has expired. Sign in again." },
      401,
    );
  }

  const db = (path: string, init: RequestInit = {}) =>
    fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  if (request.method === "GET") {
    const res = await db(
      `api_keys?owner_id=eq.${user.sub}&select=id,name,prefix,created_at,last_used_at,expires_at,revoked_at&order=created_at.desc`,
    );
    if (!res.ok) return json({ error: "upstream_error", message: "Could not list keys." }, 502);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const now = Date.now();
    return json({
      keys: rows.map((r) => ({
        ...r,
        status: r.revoked_at
          ? "revoked"
          : new Date(String(r.expires_at)).getTime() <= now
            ? "expired"
            : "active",
      })),
    });
  }

  if (request.method === "POST") {
    let body: { name?: string };
    try {
      body = (await request.json()) as { name?: string };
    } catch {
      return json({ error: "invalid_json", message: "Body must be JSON." }, 400);
    }
    const name = (body.name ?? "").trim();
    if (name.length < 1 || name.length > 60) {
      return json(
        { error: "invalid_name", message: "Give the key a name, 1-60 characters." },
        400,
      );
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + KEY_TTL_DAYS * 86_400_000);
    const key = await mintKey(
      { k: id, u: user.sub, e: Math.floor(expiresAt.getTime() / 1000) },
      env.MAPROLL_KEY_SECRET,
    );
    const { prefix, tokenHash } = await keyRecord(key);

    const res = await db("api_keys", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        id,
        owner_id: user.sub,
        name,
        prefix,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }),
    });
    if (!res.ok) {
      return json({ error: "upstream_error", message: "Could not save the key." }, 502);
    }

    // The only time the full key is ever returned. It is not recoverable
    // afterwards — the table stores a hash for identification, not the token.
    return json({ key, id, name, prefix, expires_at: expiresAt.toISOString() }, 201);
  }

  if (request.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "invalid_request", message: "Pass ?id=." }, 400);
    const res = await db(`api_keys?id=eq.${id}&owner_id=eq.${user.sub}`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!res.ok) return json({ error: "upstream_error", message: "Could not revoke." }, 502);
    // Worth being straight with the caller: the render API verifies signatures
    // and consults no list, so a revoked key keeps working until it expires.
    return json({
      revoked: true,
      note: "Revoked here. The render API verifies signatures without a lookup, so this key stops rendering when it expires.",
    });
  }

  return json({ error: "method_not_allowed", message: `${request.method} not supported.` }, 405);
}
