import { describe, expect, it } from "vitest";
import { buildUrl } from "@maproll/map-url";

import { paramsFromArgs } from "../src/tools/create-map.js";
import { applyLayers } from "../src/tools/add-layers.js";
import { CATALOGS } from "../src/catalog.js";
import { EXAMPLES } from "../src/examples.js";

const q = (url: string) => new URL(url).searchParams;

describe("create_map → URL grammar", () => {
  it("writes numeric values as ID:number pairs", () => {
    const p = paramsFromArgs({
      scope: "world",
      values: [{ id: "US", value: 200 }, { id: "CN", value: 150 }],
    });
    expect(p.data).toBe("US:200,CN:150");
  });

  it("writes a per-region override as ID:number:#hex", () => {
    const p = paramsFromArgs({
      scope: "world",
      values: [{ id: "US", value: 200, color: "#ff0000" }, { id: "DE", value: 95 }],
    });
    expect(p.data).toBe("US:200:#ff0000,DE:95");
  });

  it("writes flat paint as ID:#hex", () => {
    const p = paramsFromArgs({
      scope: "world",
      values: [{ id: "UA", color: "#2563eb" }, { id: "RU", color: "#dc2626" }],
    });
    expect(p.data).toBe("UA:#2563eb,RU:#dc2626");
  });

  it("writes categories as ID:text", () => {
    const p = paramsFromArgs({
      scope: "world",
      values: [{ id: "US", category: "NATO" }, { id: "CN", category: "BRICS" }],
    });
    expect(p.data).toBe("US:NATO,CN:BRICS");
  });

  it("refuses to mix numeric values with text categories", () => {
    // The renderer rejects this; failing here names the offending ids instead
    // of returning a 400 the model has to reverse-engineer.
    expect(() =>
      paramsFromArgs({
        scope: "world",
        values: [{ id: "US", value: 1 }, { id: "CN", category: "BRICS" }],
      }),
    ).toThrow(/cannot mix/i);
  });

  it("rejects a colour that is not a hex", () => {
    expect(() =>
      paramsFromArgs({ scope: "world", values: [{ id: "US", color: "red" }] }),
    ).toThrow(/6-digit hex/);
  });

  it("rejects a region with nothing to draw", () => {
    expect(() => paramsFromArgs({ scope: "world", values: [{ id: "US" }] })).toThrow(
      /no value, color, or category/,
    );
  });

  it("joins highlight, breaks and labels into their param forms", () => {
    const p = paramsFromArgs({
      scope: "world",
      highlight: ["DE", "FR", "IT"],
      breaks: [10, 30, 60],
      labels: ["RO", "DE"],
    });
    expect(p.regions).toBe("DE,FR,IT");
    expect(p.breaks).toBe("10,30,60");
    expect(p.labels).toBe("RO,DE");
  });

  it("lets `extra` reach the URL for params without a field", () => {
    const p = paramsFromArgs({
      scope: "world",
      extra: { labelMinArea: 400, patterns: "DE:dots" },
    });
    expect(q(buildUrl(p)).get("labelMinArea")).toBe("400");
    expect(q(buildUrl(p)).get("patterns")).toBe("DE:dots");
  });

  it("produces the documented example URL end to end", () => {
    const p = paramsFromArgs({
      scope: "world",
      title: "Coffee",
      values: [{ id: "FI", value: 12 }],
      theme: "dark",
    });
    expect(buildUrl(p)).toBe(
      "https://api.maproll.io/map.svg?scope=world&data=FI%3A12&title=Coffee&theme=dark",
    );
  });
});

describe("add_layers", () => {
  const base = "https://api.maproll.io/map.svg?scope=world&theme=dark";

  it("appends markers to a map that already has one", () => {
    const withOne = buildUrl(
      { scope: "world" },
      { markers: [{ lat: 10, lon: 20, icon: "pin" }] },
    );
    const out = applyLayers({
      map: withOne,
      markers: [{ lat: 44.43, lon: 26.1, icon: "airport", label: "Bucharest" }],
    });
    expect(out.markers).toHaveLength(2);
    expect(out.markers[0]).toMatchObject({ lat: 10, lon: 20 });
    expect(out.markers[1]).toMatchObject({ label: "Bucharest" });
  });

  it("keeps the params of the map it was given", () => {
    const out = applyLayers({ map: base, markers: [{ lat: 1, lon: 2 }] });
    expect(out.params.scope).toBe("world");
    expect(out.params.theme).toBe("dark");
  });

  it("appends pair-list params rather than replacing them", () => {
    const withPattern = `${base}&patterns=DE%3Adots`;
    const out = applyLayers({
      map: withPattern,
      patterns: [{ id: "IT", pattern: "stripes" }],
    });
    expect(out.params.patterns).toBe("DE:dots,IT:stripes");
  });

  it("strips delimiters from annotation text", () => {
    const out = applyLayers({
      map: base,
      annotations: [{ id: "RO", text: "Election: 2024, delayed" }],
    });
    // `,` and `:` separate pairs and fields; leaving them in would split the
    // annotation into garbage entries.
    expect(out.params.annotations).toBe("RO:Election 2024 delayed");
  });

  it("rejects a marker with both an icon and a SIDC", () => {
    expect(() =>
      applyLayers({ map: base, markers: [{ lat: 1, lon: 2, icon: "tank", sidc: "1".repeat(20) }] }),
    ).toThrow(/both icon and sidc/);
  });

  it("serialises a sea route with its flags", () => {
    const out = applyLayers({
      map: base,
      routes: [{ from: "31.23,121.47", to: "51.92,4.48", sea: true, arrow: true }],
    });
    const url = buildUrl(out.params, { routes: out.routes });
    expect(q(url).get("routes")).toBe("31.23,121.47>51.92,4.48:arrow:sea");
  });
});

describe("catalogs", () => {
  it("covers every scope the grammar promises", () => {
    expect(CATALOGS.scopes.count).toBeGreaterThan(150);
    expect(CATALOGS.scopes.groups.map((g) => g.code)).toContain("NATO");
  });

  it("lists exactly the 30 documented icons", () => {
    const all = Object.values(CATALOGS.icons).flat();
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
  });

  it("states the rule that most often breaks a render", () => {
    expect(CATALOGS.grammar.hardRule).toMatch(/cannot appear in the same request/i);
    expect(CATALOGS.grammar.dataShapes).toHaveLength(4);
  });
});

describe("worked examples", () => {
  // The examples are few-shot material; an example that does not survive the
  // real argument path would teach the model something that fails.
  it("every create_map example produces a valid URL", () => {
    for (const ex of EXAMPLES) {
      if (ex.tool !== "create_map") continue;
      const args = ex.args as Parameters<typeof paramsFromArgs>[0];
      const url = buildUrl(paramsFromArgs(args));
      expect(url, ex.request).toContain("scope=");
    }
  });
});
