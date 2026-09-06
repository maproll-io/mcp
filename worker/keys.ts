/**
 * maproll API keys.
 *
 * A key is not a secret to look up — it is a signed statement. The render API
 * holds no database by standing rule, and a per-render lookup would spend the
 * cold-render budget on I/O, so verification is a local HMAC recomputation:
 * no network, no state, microseconds.
 *
 *   mr_live_<base64url(payload)>.<base64url(hmac-sha256)>
 *
 * The tradeoff is honest and worth stating: because the API never consults a
 * list, it cannot know a key was revoked. Revocation is bounded by expiry
 * instead — a revoked key stops working when it expires, not before. What a
 * leaked key buys is rendering without the wordmark, so the exposure is
 * proportionate to the mechanism.
 */

export interface KeyPayload {
  /** api_keys.id — lets the issuer tie a token back to its row. */
  k: string;
  /** Owner user id. */
  u: string;
  /** Expiry, seconds since epoch. */
  e: number;
}

const PREFIX = "mr_live_";

/** Days a minted key is valid for. Rotation stands in for revocation. */
export const KEY_TTL_DAYS = 90;

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // Built with the constructor rather than Uint8Array.from so the buffer type
  // is ArrayBuffer, which is what BufferSource (crypto.subtle) requires.
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function mintKey(
  payload: KeyPayload,
  secret: string,
): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(body),
  );
  return `${PREFIX}${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export type VerifyResult =
  | { ok: true; payload: KeyPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * Verify a key. Pure computation — safe to call on the render path.
 * `now` is injectable so expiry is testable without clock games.
 */
export async function verifyKey(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<VerifyResult> {
  if (!token.startsWith(PREFIX)) return { ok: false, reason: "malformed" };
  const rest = token.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0 || dot === rest.length - 1) return { ok: false, reason: "malformed" };

  const body = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // Signature is checked before the payload is parsed, so an attacker cannot
  // probe the parser with unsigned input.
  if (!valid) return { ok: false, reason: "bad_signature" };

  let payload: KeyPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as KeyPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.e !== "number" || payload.e * 1000 <= now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/** What the issuer stores: enough to identify a key, never enough to use it. */
export async function keyRecord(token: string): Promise<{
  prefix: string;
  tokenHash: string;
}> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return {
    prefix: token.slice(0, PREFIX.length + 6),
    tokenHash: [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  };
}
