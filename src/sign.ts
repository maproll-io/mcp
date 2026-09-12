import { createHmac } from "node:crypto";

import { API_KEY } from "./constants.js";

/**
 * Embed-safe entitlement for a map URL.
 *
 * The render API refuses to read a raw key out of a query string, and rightly
 * so: a key in a URL is baked into every embed the caller publishes, and from
 * there it signs anything. But an MCP-made map *is* a URL — the whole product
 * promise — so the entitlement has to travel inside one.
 *
 * So the URL carries the key's payload and a MAC over that URL's own query,
 * keyed by the key's signature rather than by the key:
 *
 *   k = <payload>                             the claims, without the signature
 *   t = HMAC(signature, canonical query)      bound to this one map
 *
 * The API recomputes the signature from MAPROLL_KEY_SECRET and then recomputes
 * t, with no lookup. A published embed therefore entitles that map and nothing
 * else, and cannot be unpicked back into a key.
 *
 * The verifier is `verifyUrlToken` in the render API (`src/lib/api-key.ts`),
 * and the two canonicalisations must agree byte for byte. If they ever drift,
 * keyed embeds quietly lose the entitlement and start carrying the wordmark —
 * which is what `tests/sign.test.ts` checks against its own reimplementation
 * of the verifier.
 */

const PREFIX = "mr_live_";

export const URL_KEY_PARAM = "k";
export const URL_TOKEN_PARAM = "t";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function paramName(pair: string): string {
  const eq = pair.indexOf("=");
  return eq === -1 ? pair : pair.slice(0, eq);
}

/**
 * The bytes the token signs: every query pair except the token's own two,
 * sorted, joined with "&".
 *
 * No percent-decoding, deliberately — see the note in the render API. The
 * pairs as they sit in the URL are the one representation both sides hold.
 *
 * No "?" means no query, and canonicalises to "". The signer sees the URL
 * before k/t are appended and the verifier sees it after, so treating a
 * parameterless URL as its own query would make the two disagree.
 */
export function canonicalizeQuery(url: string): string {
  const qmark = url.indexOf("?");
  if (qmark === -1) return "";
  const search = url.slice(qmark + 1);
  return search
    .split("&")
    .filter((pair) => {
      if (pair === "") return false;
      const name = paramName(pair);
      return name !== URL_KEY_PARAM && name !== URL_TOKEN_PARAM;
    })
    .sort()
    .join("&");
}

/**
 * Append `k`/`t` to a map URL, if this server holds a key. Without one the URL
 * is returned untouched — anonymous is a supported mode, not an error.
 *
 * The pair is appended as text rather than through `URLSearchParams`, which
 * would re-serialise the whole query and re-encode what is already there
 * (`data=US:1` becomes `data=US%3A1`). The signature covers the bytes as they
 * stand, so re-encoding after signing would invalidate every token.
 */
export function signUrl(url: string, key: string | undefined = API_KEY): string {
  if (!key || !key.startsWith(PREFIX)) return url;

  const rest = key.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  // A malformed key is not worth an exception: the map is still perfectly
  // renderable, it just carries the wordmark.
  if (dot <= 0 || dot === rest.length - 1) return url;

  const payload = rest.slice(0, dot);
  const signature = rest.slice(dot + 1);
  const token = b64url(
    createHmac("sha256", signature).update(canonicalizeQuery(url)).digest(),
  );

  // Both halves are base64url, so nothing here needs escaping.
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${URL_KEY_PARAM}=${payload}&${URL_TOKEN_PARAM}=${token}`;
}

/**
 * Drop `k`/`t` from a URL. Used for the editor link: an entitlement belongs in
 * an embed, not in a link a user pastes into a browser and shares onward.
 */
export function stripSignature(url: string): string {
  const qmark = url.indexOf("?");
  if (qmark === -1) return url;

  const kept = url
    .slice(qmark + 1)
    .split("&")
    .filter((pair) => {
      if (pair === "") return false;
      const name = paramName(pair);
      return name !== URL_KEY_PARAM && name !== URL_TOKEN_PARAM;
    })
    .join("&");

  return kept === "" ? url.slice(0, qmark) : `${url.slice(0, qmark)}?${kept}`;
}
