import type { McpServer } from "@modelcontextprotocol/server";

import { CATALOGS, type CatalogKind } from "./catalog.js";
import { EXAMPLES } from "./examples.js";

/** A day. The catalogs change when the renderer ships, not per request. */
const CATALOG_TTL_MS = 86_400_000;

const json = (uri: string, body: unknown) => ({
  contents: [
    {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(body, null, 2),
    },
  ],
});

export function registerResources(server: McpServer): void {
  server.registerResource(
    "grammar",
    "maproll://grammar",
    {
      title: "maproll URL grammar",
      description:
        "How region data, markers and routes are encoded in a map URL, and the one rule that cannot be broken (numeric values and text categories never mix).",
      mimeType: "application/json",
      cacheHint: { ttlMs: CATALOG_TTL_MS, cacheScope: "public" },
    },
    async (uri) => json(uri.href, CATALOGS.grammar),
  );

  const catalogs: Array<[CatalogKind, string, string]> = [
    ["scopes", "Scopes", "Every geography that can be drawn: world, 17 groups, and the country scopes."],
    ["themes", "Themes", "The six colour themes, and what each is for."],
    ["icons", "Marker icons", "The 30 built-in icon names, grouped. An invented name renders nothing."],
    ["projections", "Projections", "Available projections and when each is the right choice."],
    ["patterns", "Pattern fills", "Texture fills for hatching a category onto a choropleth."],
  ];

  for (const [kind, title, description] of catalogs) {
    server.registerResource(
      kind,
      `maproll://catalog/${kind}`,
      {
        title,
        description,
        mimeType: "application/json",
        cacheHint: { ttlMs: CATALOG_TTL_MS, cacheScope: "public" },
      },
      async (uri) => json(uri.href, CATALOGS[kind]),
    );
  }

  server.registerResource(
    "examples",
    "maproll://examples",
    {
      title: "Worked examples",
      description:
        "Real requests paired with the create_map arguments that answer them — few-shot material in the exact shape the tool takes.",
      mimeType: "application/json",
      cacheHint: { ttlMs: CATALOG_TTL_MS, cacheScope: "public" },
    },
    async (uri) => json(uri.href, EXAMPLES),
  );
}
