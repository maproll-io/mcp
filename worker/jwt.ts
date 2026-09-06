/**
 * Supabase access-token verification via the project's JWKS. Same approach as
 * the editor's Pages Function: no shared signing secret, and the public keys
 * are cached in the isolate so warm requests skip the fetch.
 */
let cachedUrl: string | null = null;
let cachedKeys: CryptoKey[] | null = null;

interface Jwk {
  kty: string;
  alg?: string;
  use?: string;
}

async function loadKeys(supabaseUrl: string): Promise<CryptoKey[]> {
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  if (cachedUrl === url && cachedKeys) return cachedKeys;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };

  const imported: CryptoKey[] = [];
  for (const jwk of keys ?? []) {
    if (jwk.kty !== "EC" && jwk.kty !== "RSA") continue;
    const alg =
      jwk.kty === "EC"
        ? { name: "ECDSA", namedCurve: "P-256" }
        : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    try {
      imported.push(
        await crypto.subtle.importKey("jwk", jwk as JsonWebKey, alg, false, ["verify"]),
      );
    } catch {
      /* skip keys this runtime cannot import */
    }
  }
  cachedUrl = url;
  cachedKeys = imported;
  return imported;
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

  let alg: string;
  try {
    alg = (JSON.parse(new TextDecoder().decode(b64urlToBytes(head))) as { alg: string }).alg;
  } catch {
    return null;
  }

  const signed = new TextEncoder().encode(`${head}.${body}`);
  const verifyAlg =
    alg === "RS256"
      ? { name: "RSASSA-PKCS1-v1_5" }
      : { name: "ECDSA", hash: "SHA-256" };

  let ok = false;
  for (const key of await loadKeys(supabaseUrl)) {
    try {
      if (await crypto.subtle.verify(verifyAlg, key, b64urlToBytes(sig), signed)) {
        ok = true;
        break;
      }
    } catch {
      /* wrong key type for this token */
    }
  }
  if (!ok) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as {
      sub?: string;
      email?: string;
      exp?: number;
    };
    if (!claims.sub) return null;
    if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
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
