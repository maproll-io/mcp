/**
 * Supabase access-token verification via the project's JWKS. Same approach as
 * the editor's Pages Function: no shared signing secret, and the public keys
 * are cached in the isolate so warm requests skip the fetch.
 */
interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
}

interface KeySet {
  url: string;
  keys: Map<string | undefined, CryptoKey>;
  fetchedAt: number;
}

let cached: KeySet | null = null;

/** Keys are refetched after this long even if every verify succeeds. */
const JWKS_MAX_AGE_MS = 10 * 60_000;
/** A kid miss refetches at most this often, so junk tokens cannot hammer Supabase. */
const JWKS_COOLDOWN_MS = 30_000;

/** The algorithms Supabase signs with. Anything else is refused, not guessed at. */
const ALGS = {
  RS256: {
    kty: "RSA",
    importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    verifyAlg: { name: "RSASSA-PKCS1-v1_5" },
  },
  ES256: {
    kty: "EC",
    importAlg: { name: "ECDSA", namedCurve: "P-256" },
    verifyAlg: { name: "ECDSA", hash: "SHA-256" },
  },
} as const;

type Alg = keyof typeof ALGS;

async function fetchKeys(url: string): Promise<KeySet> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };

  const imported = new Map<string | undefined, CryptoKey>();
  for (const jwk of keys ?? []) {
    const spec = Object.values(ALGS).find((a) => a.kty === jwk.kty);
    if (!spec) continue;
    try {
      imported.set(
        jwk.kid,
        await crypto.subtle.importKey("jwk", jwk as JsonWebKey, spec.importAlg, false, ["verify"]),
      );
    } catch {
      /* skip keys this runtime cannot import */
    }
  }
  return { url, keys: imported, fetchedAt: Date.now() };
}

/**
 * The key for a token's kid. Cached per isolate, but not forever: after
 * Supabase rotates its signing key, a token with the new kid misses the cache
 * and triggers one refetch (rate-limited by the cooldown). Caching the first
 * fetch for the isolate's lifetime meant sign-ins failed after a rotation
 * until Cloudflare happened to evict the isolate.
 */
async function keyFor(supabaseUrl: string, kid: string | undefined): Promise<CryptoKey | null> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  const now = Date.now();

  if (!cached || cached.url !== url || now - cached.fetchedAt > JWKS_MAX_AGE_MS) {
    cached = await fetchKeys(url);
  }
  let key = cached.keys.get(kid);
  if (!key && now - cached.fetchedAt > JWKS_COOLDOWN_MS) {
    cached = await fetchKeys(url);
    key = cached.keys.get(kid);
  }
  return key ?? null;
}

function b64urlToBytes(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export interface VerifiedUser {
  sub: string;
  email?: string;
}

export async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string,
): Promise<VerifiedUser | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(head))) as typeof header;
  } catch {
    return null;
  }
  if (!header.alg || !(header.alg in ALGS)) return null;
  const spec = ALGS[header.alg as Alg];

  let key: CryptoKey | null;
  try {
    key = await keyFor(supabaseUrl, header.kid);
  } catch {
    return null;
  }
  if (!key || key.algorithm.name !== spec.importAlg.name) return null;

  try {
    const signed = new TextEncoder().encode(`${head}.${body}`);
    if (!(await crypto.subtle.verify(spec.verifyAlg, key, b64urlToBytes(sig), signed))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as {
      sub?: string;
      email?: string;
      exp?: number;
      iss?: string;
      aud?: string | string[];
    };
    if (!claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    // A signed-in user's access token. The anon and service-role JWTs are
    // signed by the same project but carry other audiences.
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes("authenticated")) return null;
    if (claims.iss !== `${supabaseUrl.replace(/\/$/, "")}/auth/v1`) return null;
    return claims.email ? { sub: claims.sub, email: claims.email } : { sub: claims.sub };
  } catch {
    return null;
  }
}

export function extractBearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? (m[1] as string) : null;
}
