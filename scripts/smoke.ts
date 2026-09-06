/**
 * End-to-end: spawn the real stdio server, speak real MCP, exercise every
 * tool, resource and prompt against the live API, and write the rendered map
 * to disk so it can be looked at.
 *
 *   npx wrangler dev --config worker/wrangler.toml --port 8795 &
 *   MAPROLL_PLACES_URL=http://127.0.0.1:8795/places npx tsx scripts/smoke.ts
 */
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const OUT = process.env.SMOKE_OUT ?? "/tmp/maproll-smoke.png";
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const client = new Client({ name: "smoke", version: "0.1.0" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
    env: { ...process.env } as Record<string, string>,
  }),
);

const { tools } = await client.listTools();
check("four tools advertised", tools.length === 4, tools.map((t) => t.name).join(", "));
check(
  "every tool has a description a model can act on",
  tools.every((t) => (t.description ?? "").length > 120),
);

const { resources } = await client.listResources();
check("seven resources advertised", resources.length === 7, String(resources.length));

const grammar = await client.readResource({ uri: "maproll://grammar" });
const grammarText = (grammar.contents[0] as { text: string }).text;
check("grammar resource states the mixing rule", /cannot appear in the same request/i.test(grammarText));

const { prompts } = await client.listPrompts();
check("three prompts advertised", prompts.length === 3, prompts.map((p) => p.name).join(", "));

const mapped = await client.getPrompt({
  name: "mapped_episode",
  arguments: { dataset: "Coffee kg/person: FI 12, US 4.2", angle: "Finland runs on it" },
});
check(
  "mapped_episode carries the house style",
  JSON.stringify(mapped.messages).includes("Finland runs on it"),
);

// 1. create_map
const created = await client.callTool({
  name: "create_map",
  arguments: {
    scope: "world",
    title: "Coffee consumption per capita",
    subtitle: "kg per person per year",
    legendTitle: "kg / person",
    values: [
      { id: "FI", value: 12 },
      { id: "NO", value: 9.9 },
      { id: "BR", value: 5.8 },
      { id: "US", value: 4.2 },
      { id: "DE", value: 5.5 },
    ],
  },
});
const createdOut = created.structuredContent as { svg_url: string; warnings: string[] };
check("create_map returned an image block", (created.content as Array<{ type: string }>).some((c) => c.type === "image"));
check("create_map tagged the render", createdOut.svg_url.includes("src=mcp"));
check("clean data produced no warnings", createdOut.warnings.length === 0, createdOut.warnings.join("; "));

// 2. find_places — the tool that exists because models hallucinate coordinates
const found = await client.callTool({
  name: "find_places",
  arguments: { query: "Constanta", kind: "city", limit: 3 },
});
const places = (found.structuredContent as { places: Array<{ id: string; lat: number; lon: number }> }).places;
check("find_places resolved a city", places.length > 0, places[0] ? `${places[0].id} ${places[0].lat},${places[0].lon}` : "none");

// 3. add_layers — appends onto the map from step 1, using the real coordinates
const place = places[0];
const layered = await client.callTool({
  name: "add_layers",
  arguments: {
    map: createdOut.svg_url,
    markers: [{ lat: place.lat, lon: place.lon, icon: "anchor", label: "Constanța", labelPosition: "bottom" }],
    routes: [{ from: "31.23,121.47", to: "51.92,4.48", sea: true, arrow: true }],
  },
});
const layeredOut = layered.structuredContent as { svg_url: string; png_url: string };
const layeredQ = new URL(layeredOut.svg_url).searchParams;
check("add_layers kept the original data", layeredQ.get("data")?.startsWith("FI:12") ?? false);
check("add_layers kept the title", layeredQ.get("title") === "Coffee consumption per capita");
check("add_layers added the marker", layeredQ.get("markers")?.includes("anchor") ?? false);
check("add_layers added the sea route", layeredQ.get("routes")?.includes("sea") ?? false);

// 4. describe_options
const opts = await client.callTool({ name: "describe_options", arguments: { kind: "icons" } });
const iconText = (opts.content as Array<{ text: string }>)[0].text;
check("describe_options lists icons", iconText.includes("anchor"));

const img = (layered.content as Array<{ type: string; data?: string }>).find((c) => c.type === "image");
if (img?.data) {
  writeFileSync(OUT, Buffer.from(img.data, "base64"));
  console.log(`\nwrote ${OUT}`);
}

await client.close();
console.log(failures === 0 ? "\nOK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
