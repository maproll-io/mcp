import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildUrl, parseUrl } from "@maproll/map-url";

import { canonicalizeQuery, signUrl, stripSignature } from "../src/sign.js";

const SECRET = "sign-test-secret";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const payloadOf = (claims: Record<string, unknown>) =>
  b64url(Buffer.from(JSON.stringify(claims)));

/** A key the way the maproll edge mints one. */
function mint(claims: Record<string, unknown> = { k: "kid", u: "uid", e: 4_000_000_000 }): string {
  const payload = payloadOf(claims);
  return `mr_live_${payload}.${b64url(createHmac("sha256", SECRET).update(payload).digest())}`;
}

/**
 * An independent reimplementation of the render API's `verifyUrlToken`, held
 * deliberately separate from src/sign.ts. This is the test that matters: the
 * signer and the verifier live in different repos, and if their
 * canonicalisation drifts, keyed embeds lose the entitlement silently and every
 * published map starts carrying the wordmark again.
 */
function verifyAsApiWould(url: string, secret = SECRET): boolean {
  const search = url.slice(url.indexOf("?") + 1);
  const pairs = search.split("&").filter(Boolean);
  const k = pairs.find((p) => p.startsWith("k="))?.slice(2);
  const t = pairs.find((p) => p.startsWith("t="))?.slice(2);
  if (!k || !t) return false;

  const canonical = pairs
    .filter((p) => !p.startsWith("k=") && !p.startsWith("t="))
    .sort()
    .join("&");
  const keySignature = b64url(createHmac("sha256", secret).update(k).digest());
  return t === b64url(createHmac("sha256", keySignature).update(canonical).digest());
}

describe("signUrl", () => {
  const url = "https://api.maproll.io/map.svg?scope=world&data=US%3A200%2CCN%3A150&src=mcp";

  it("produces a token the API's verifier accepts", () => {
    expect(verifyAsApiWould(signUrl(url, mint()))).toBe(true);
  });

  it("leaves the existing query byte-for-byte intact", () => {
    // The signature covers these bytes. Re-serialising through URLSearchParams
    // would re-encode them and invalidate every token ever minted.
    const signed = signUrl(url, mint());
    expect(signed.startsWith(`${url}&k=`)).toBe(true);
  });

  it("survives the encodings a real map URL carries", () => {
    const real = buildUrl(
      {
        scope: "world",
        data: "US:200:#ff0000,DE:95",
        title: "Coffee consumption per capita",
        legendTitle: "kg / person",
        theme: "dark",
      } as never,
      { base: "https://api.maproll.io", extraQuery: { src: "mcp" } },
    );
    expect(verifyAsApiWould(signUrl(real, mint()))).toBe(true);
  });

  it("binds the token to this map and no other", () => {
    const signed = signUrl(url, mint());
    expect(verifyAsApiWould(signed.replace("data=US%3A200", "data=US%3A999"))).toBe(false);
  });

  it("is a no-op without a key", () => {
    expect(signUrl(url, undefined)).toBe(url);
  });

  it("is a no-op for a key that is not a maproll key", () => {
    // A misconfigured env var must cost the wordmark, not the map.
    for (const bad of ["", "sk-whatever", "mr_live_", "mr_live_abc", "mr_live_.sig"]) {
      expect(signUrl(url, bad)).toBe(url);
    }
  });

  it("signs a URL that has no query at all, verifiably", () => {
    // Both sides canonicalise this to "": the signer before k/t exist, the
    // verifier after. Asserting the round trip, not just the shape, is what
    // catches the two disagreeing.
    const bare = "https://api.maproll.io/map.svg";
    const signed = signUrl(bare, mint());
    expect(signed).toMatch(/^https:\/\/api\.maproll\.io\/map\.svg\?k=/);
    expect(verifyAsApiWould(signed)).toBe(true);
  });
});

describe("canonicalizeQuery", () => {
  it("sorts pairs and drops the token's own two", () => {
    expect(canonicalizeQuery("https://x/map.svg?theme=dark&scope=world&k=a&t=b")).toBe(
      "scope=world&theme=dark",
    );
  });

  it("does not decode", () => {
    expect(canonicalizeQuery("?title=a%20b")).toBe("title=a%20b");
  });
});

describe("stripSignature", () => {
  it("removes only k and t", () => {
    expect(stripSignature("https://x/map.svg?scope=world&k=a&t=b&theme=dark")).toBe(
      "https://x/map.svg?scope=world&theme=dark",
    );
  });

  it("drops the whole query when nothing else is left", () => {
    expect(stripSignature("https://x/map.svg?k=a&t=b")).toBe("https://x/map.svg");
  });

  it("leaves an unsigned URL alone", () => {
    const url = "https://x/map.svg?scope=world";
    expect(stripSignature(url)).toBe(url);
  });
});

describe("round-tripping a signed URL through add_layers", () => {
  it("drops the old token on parse, so the next call re-signs cleanly", () => {
    // parseUrl keeps only map params. If it ever carried k/t through, buildUrl
    // would re-emit a token signed over the *previous* query — valid-looking
    // and wrong.
    const signed = signUrl(
      "https://api.maproll.io/map.svg?scope=world&data=US%3A1&src=mcp",
      mint(),
    );
    const parsed = parseUrl(signed);
    expect(parsed.params).not.toHaveProperty("k");
    expect(parsed.params).not.toHaveProperty("t");
  });
});
