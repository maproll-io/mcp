import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { fetchPreview } from "../src/render.js";
import { VERSION } from "../src/version.js";

const url = "https://api.maproll.io/map.png?scope=world";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchPreview", () => {
  it("returns the PNG and the unknown ids on success", async () => {
    stubFetch(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "x-geo-warnings": "unknown-ids:XX,YY" },
      }),
    );
    const p = await fetchPreview(url);
    expect(p.data).toBe("AQID");
    expect(p.unknownIds).toEqual(["XX", "YY"]);
  });

  it("throws on a 4xx, naming the API's message", async () => {
    // A 4xx means the map itself is wrong; every URL would fail the same way.
    stubFetch(async () =>
      Response.json({ error: "bad_scope", message: "Unknown scope ZZ" }, { status: 400 }),
    );
    await expect(fetchPreview(url)).rejects.toThrow(/400: Unknown scope ZZ/);
  });

  it("degrades to a warning on a 5xx", async () => {
    stubFetch(async () => new Response("boom", { status: 503, statusText: "Unavailable" }));
    const p = await fetchPreview(url);
    expect(p.data).toBeNull();
    expect("warning" in p && p.warning).toMatch(/503.*URLs are valid/);
  });

  it("degrades to a warning on a timeout", async () => {
    stubFetch(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const p = await fetchPreview(url);
    expect(p.data).toBeNull();
    expect("warning" in p && p.warning).toMatch(/did not render within/);
  });

  it("degrades to a warning on a network error", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const p = await fetchPreview(url);
    expect("warning" in p && p.warning).toMatch(/network error/);
  });
});

describe("version", () => {
  it("is package.json's, and server.json agrees", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const srv = JSON.parse(readFileSync("server.json", "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect(srv.version).toBe(pkg.version);
    for (const p of srv.packages) expect(p.version).toBe(pkg.version);
  });
});
