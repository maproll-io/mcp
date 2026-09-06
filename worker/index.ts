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

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
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
