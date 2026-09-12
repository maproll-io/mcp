import { ALL_SCOPES, GROUP_SCOPES, SCOPES } from "@maproll/map-url";

/**
 * One definition of what the renderer accepts, read by both the resources and
 * the describe_options tool. Written for a model that has never seen maproll:
 * every list is exhaustive, because a value invented to fill a gap renders
 * nothing and reports no error.
 */

export const THEMES = [
  { name: "dark", note: "Navy oceans, warm land. The default and the house style." },
  { name: "dark-blue", note: "Dark, blue ramp." },
  { name: "dark-mono", note: "Dark, single-hue ramp. Good when the map is one story." },
  { name: "light", note: "Light ground, warm ramp. Print and documents." },
  { name: "light-blue", note: "Light, blue ramp." },
  { name: "light-mono", note: "Light, single-hue. The cleanest for highlight-only maps." },
] as const;

export const PROJECTIONS = [
  { name: "naturalEarth1", note: "Default for world. Compromise projection, familiar shape." },
  { name: "albersUsa", note: "US only. Insets Alaska and Hawaii." },
  { name: "conicConformal", note: "Default for most country scopes; fitted to bounds." },
  { name: "mercator", note: "Web-map convention. Badly distorts area at high latitudes." },
  { name: "equalEarth", note: "Equal-area world. Use when the map compares magnitudes." },
] as const;

export const ICONS = {
  shapes: ["dot", "square", "triangle", "cross", "star"],
  location: ["pin", "flag"],
  transport: ["airport", "anchor", "car", "bicycle", "helicopter", "ship", "train", "truck"],
  buildings: ["house", "building", "factory", "hospital"],
  military: ["tank", "base", "bomb"],
  civic: ["fist", "soccer-ball", "megaphone"],
  nature: ["mountain", "fire", "lightning", "warning"],
  social: ["person"],
} as const;

export const PATTERNS = [
  "stripes",
  "stripes-diagonal",
  "dots",
  "crosshatch",
  "solid-outline",
] as const;

/**
 * The part a model gets wrong without help. The packed forms below are what
 * the URL carries; the tools take structured input and write these, so this
 * is documentation of the medium rather than something to hand-assemble.
 */
export const GRAMMAR = {
  summary:
    "A maproll map is a URL. Region data rides in `data=` as comma-separated pairs, and each pair takes one of four shapes.",
  dataShapes: [
    {
      shape: "ID:number",
      example: "US:200,CN:150",
      use: "A choropleth. Values are binned by `classification` and coloured by `colorScale`.",
    },
    {
      shape: "ID:number:#hex",
      example: "US:200:#ff0000,DE:95",
      use: "A value plus an explicit fill for that one region. The override wins over the scale.",
    },
    {
      shape: "ID:#hex",
      example: "US:#ff0000,CN:#00ff00",
      use: "Flat paint, no value behind it. Pair with legend=false — there is no scale to show.",
    },
    {
      shape: "ID:text",
      example: "US:NATO,GB:NATO,CN:BRICS",
      use: "Qualitative buckets. Selects a categorical scale and names the buckets in the legend.",
    },
  ],
  hardRule:
    "Numeric values and text categories cannot appear in the same request. A map is one or the other.",
  ids: {
    world: "ISO 3166-1 alpha-2 — US, DE, BR, CN.",
    country: 'ISO 3166-2 inside a country scope — RO-B, RO-CJ for scope="RO".',
    note: "Unrecognised ids do not fail the render; they come back in `warnings` and stay unstyled.",
  },
  markers: "lat,lon[:icon-or-sidc][:label][:labelPosition][:size], joined by ';'.",
  routes:
    "from>to[:options], joined by ';'. Options are type-distinguished and order-free: #hex is a colour, a bare number is width, 'dashed'/'solid' is style, 'arrow' and 'sea' are flags.",
} as const;

/**
 * `world` is a member of both SCOPES and GROUP_SCOPES, so ALL_SCOPES.length
 * counts it twice. Splitting the lists here and deriving the count from them
 * keeps the number honest: a model told "196" and handed 195 entries has been
 * misled about the one thing this catalog exists to be trusted on.
 *
 * The lists come from @maproll/map-url and can drift from the topology the
 * renderer actually ships. Check with:
 *
 *   curl -s https://api.maproll.io/scopes
 */
const GROUPS = GROUP_SCOPES.filter((s) => s.code !== "world");
const COUNTRIES = SCOPES.filter((s) => s.code !== "world");

export const CATALOGS = {
  scopes: {
    world: "world",
    groups: GROUPS,
    countries: COUNTRIES,
    count: 1 + GROUPS.length + COUNTRIES.length,
    note: 'A group scope draws its members ("EU", "NATO", "G20"). A country code draws that country\'s subnational regions.',
  },
  themes: THEMES,
  icons: ICONS,
  projections: PROJECTIONS,
  patterns: PATTERNS,
  grammar: GRAMMAR,
} as const;

export type CatalogKind = keyof typeof CATALOGS;
