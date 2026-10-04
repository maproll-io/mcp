import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { verifySupabaseJwt } from "../worker/jwt.js";
import { mintKey, verifyKey } from "../worker/keys.js";

/**
 * The Worker's auth paths, with a real ES256 keypair standing in for the
 * Supabase project and fetch stubbed to serve its JWKS.
 */

const SUPABASE = "https://proj-a.supabase.co";
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

interface Signer {
  kid: string;
  jwk: JsonWebKey;
  sign(claims: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

async function signer(kid: string): Promise<Signer> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "ES256" };
  return {
    kid,
    jwk,
    async sign(claims, header = {}) {
      const h = enc({ alg: "ES256", typ: "JWT", kid, ...header });
      const b = enc(claims);
      const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(`${h}.${b}`),
      );
      return `${h}.${b}.${Buffer.from(sig).toString("base64url")}`;
    },
  };
}

const good = (over: Record<string, unknown> = {}) => ({
  sub: "user-1",
  aud: "authenticated",
  iss: `${SUPABASE}/auth/v1`,
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...over,
});

let first: Signer;
let second: Signer;
let served: Signer[];
let fetches: number;

beforeAll(async () => {
  first = await signer("k1");
  second = await signer("k2");
});

function serve(...signers: Signer[]) {
  served = signers;
  fetches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      fetches += 1;
      return Response.json({ keys: served.map((s) => s.jwk) });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("verifySupabaseJwt", () => {
  it("accepts a signed-in user's access token", async () => {
    serve(first);
    expect(await verifySupabaseJwt(await first.sign(good()), SUPABASE)).toEqual({ sub: "user-1" });
  });

  it("rejects the anon / service-role audience", async () => {
    serve(first);
    expect(await verifySupabaseJwt(await first.sign(good({ aud: "anon" })), SUPABASE)).toBeNull();
  });

  it("rejects another project's issuer", async () => {
    serve(first);
    const t = await first.sign(good({ iss: "https://evil.supabase.co/auth/v1" }));
    expect(await verifySupabaseJwt(t, SUPABASE)).toBeNull();
  });

  it("rejects an expired or exp-less token", async () => {
    serve(first);
    expect(await verifySupabaseJwt(await first.sign(good({ exp: 1 })), SUPABASE)).toBeNull();
    expect(await verifySupabaseJwt(await first.sign(good({ exp: undefined })), SUPABASE)).toBeNull();
  });

  it("refuses algorithms outside RS256/ES256", async () => {
    serve(first);
    const t = await first.sign(good(), { alg: "HS256" });
    expect(await verifySupabaseJwt(t, SUPABASE)).toBeNull();
  });

  it("picks up a rotated key instead of failing until the isolate dies", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    serve(first);
    expect(await verifySupabaseJwt(await first.sign(good()), SUPABASE)).not.toBeNull();

    // Supabase rotates: the JWKS now serves k2. A k2 token misses the cache.
    served = [first, second];
    vi.setSystemTime(Date.now() + 60_000);
    expect(await verifySupabaseJwt(await second.sign(good()), SUPABASE)).toEqual({
      sub: "user-1",
    });
  });

  it("does not refetch on every unknown kid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3_600_000); // past max age: next call refetches
    serve(first);
    const stranger = await signer("k-unknown");
    await verifySupabaseJwt(await first.sign(good()), SUPABASE);
    const after = fetches;
    for (let i = 0; i < 5; i += 1) {
      expect(await verifySupabaseJwt(await stranger.sign(good()), SUPABASE)).toBeNull();
    }
    expect(fetches).toBe(after);
  });
});

describe("API keys", () => {
  it("round-trips a key without an owner id in the payload", async () => {
    const key = await mintKey({ k: "id-1", e: Math.floor(Date.now() / 1000) + 60 }, "s3cret");
    const payload = JSON.parse(
      Buffer.from(key.slice("mr_live_".length).split(".")[0]!, "base64url").toString(),
    );
    expect(payload).not.toHaveProperty("u");
    expect(await verifyKey(key, "s3cret")).toMatchObject({ ok: true, payload: { k: "id-1" } });
  });

  it("still verifies keys minted with an owner id", async () => {
    const key = await mintKey({ k: "id-2", u: "user-1", e: 4_102_444_800 }, "s3cret");
    expect(await verifyKey(key, "s3cret")).toMatchObject({ ok: true });
  });
});
