import * as z from "zod";

import { API_BASE, EDITOR_BASE, PREVIEW_WIDTH, SRC_TAG } from "../constants.js";
import {
  buildEmbed,
  buildUrl,
  isHexColor,
  SCOPE_CODES,
  serializeDataRows,
  type DataRow,
  type MapParams,
} from "@maproll/map-url";
import { fetchPreview } from "../render.js";

/**
 * One region's entry. Deliberately structured rather than the packed
 * "US:200:#ff0000" wire form — that grammar is a serialisation detail, and
 * asking a model to emit it by hand is asking for malformed maps.
 */
const RegionValue = z
  .object({
    id: z
      .string()
      .min(2)
      .describe(
        'Region id. ISO 3166-1 alpha-2 for the world scope ("US", "DE"); ISO 3166-2 for subnational scopes ("RO-B", "RO-CJ").',
      ),
    value: z
      .number()
      .optional()
      .describe("Numeric value driving the choropleth colour."),
    color: z
      .string()
      .optional()
      .describe(
        'Explicit fill as a 6-digit hex ("#ff0000"). With `value`, overrides the scale for this region. Without one, paints the region flat.',
      ),
    category: z
      .string()
      .optional()
      .describe(
        'Qualitative bucket ("NATO", "BRICS"). Selects a categorical scale and names the bucket in the legend. Cannot be combined with numeric values.',
      ),
  })
  .strict();

export const CreateMapInput = z
  .object({
    scope: z
      .string()
      .describe(
        'Geography to draw. "world", a group ("EU", "NATO", "G20", "ASEAN", "AFRICA"), or a country code for its subnational regions ("RO"). Read maproll://catalog/scopes for the full list.',
      ),
    values: z
      .array(RegionValue)
      .max(5000)
      .optional()
      .describe(
        "Per-region data. Give `value` for a choropleth, `color` to paint a region flat, or `category` for qualitative buckets.",
      ),
    highlight: z
      .array(z.string())
      .max(5000)
      .optional()
      .describe(
        "Region ids to highlight with no data behind them. Use instead of `values` when the point is which regions, not how much.",
      ),
    title: z.string().max(120).optional().describe("Headline above the map."),
    subtitle: z.string().max(160).optional().describe("Smaller line under the title."),
    legendTitle: z.string().max(120).optional().describe("Caption above the legend."),
    legend: z.boolean().optional().describe("Show the legend. Defaults true; set false for flat colour paints, which have no scale to show."),
    theme: z
      .enum(["dark", "dark-blue", "dark-mono", "light", "light-blue", "light-mono"])
      .optional()
      .describe("Colour theme. Defaults to dark."),
    colorScale: z
      .enum(["sequential", "diverging", "categorical"])
      .optional()
      .describe("Sequential for magnitudes, diverging for values around a midpoint, categorical for buckets."),
    classification: z
      .enum(["quantile", "jenks", "equal", "custom"])
      .optional()
      .describe("How numeric values are binned. Ignored for diverging and categorical scales."),
    breaks: z
      .array(z.number())
      .min(1)
      .max(20)
      .optional()
      .describe("Bin upper bounds. Required when classification is custom."),
    projection: z
      .enum(["naturalEarth1", "albersUsa", "conicConformal", "mercator", "equalEarth"])
      .optional()
      .describe("Map projection. Each scope has a sensible default; override only with a reason."),
    legendLayout: z.enum(["vertical", "horizontal", "continuous"]).optional(),
    width: z.number().int().min(1).max(8000).optional().describe("Pixel width. Defaults to 1200."),
    height: z.number().int().min(1).max(8000).optional().describe("Pixel height. Defaults to the projection's aspect ratio."),
    bbox: z
      .string()
      .optional()
      .describe('Crop to "minLon,minLat,maxLon,maxLat"; the projection refits to the rectangle.'),
    graticule: z.boolean().optional().describe("Draw a 10-degree lat/lon grid."),
    northArrow: z.boolean().optional().describe("Compass arrow, top right."),
    scaleBar: z.boolean().optional().describe("Kilometre scale bar, bottom left."),
    attribution: z.boolean().optional().describe("OpenStreetMap credit. On by default and should stay on."),
    labels: z
      .union([z.literal("ISO"), z.array(z.string())])
      .optional()
      .describe('"ISO" labels every region above the size threshold; an array labels only those ids.'),
    extra: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe(
        "Escape hatch for documented parameters without a field here (patterns, annotations, proportional, labelMinArea, ...). Passed through verbatim.",
      ),
  })
  .strict();

export const CreateMapOutput = z.object({
  svg_url: z.string().describe("Embeddable SVG. This is also the handle other tools take."),
  png_url: z.string().describe("Same map as PNG."),
  editor_url: z.string().describe("Open in the maproll editor."),
  embed: z.string().describe("Ready-to-paste <img> tag."),
  warnings: z.array(z.string()).describe("Non-fatal problems, e.g. region ids the renderer did not recognise."),
});

export type CreateMapArgs = z.infer<typeof CreateMapInput>;

/**
 * Turn the structured tool arguments into MapParams. Kept separate from the
 * handler so it is testable without touching the network.
 */
export function paramsFromArgs(args: CreateMapArgs): MapParams {
  const params: Record<string, unknown> = { scope: args.scope };

  if (args.values?.length) {
    params.data = serializeDataRows(toDataRows(args.values));
  }
  if (args.highlight?.length) params.regions = args.highlight.join(",");
  if (args.breaks?.length) params.breaks = args.breaks.join(",");
  if (args.labels) {
    params.labels = Array.isArray(args.labels) ? args.labels.join(",") : args.labels;
  }

  const direct = [
    "title",
    "subtitle",
    "legendTitle",
    "legend",
    "theme",
    "colorScale",
    "classification",
    "projection",
    "legendLayout",
    "width",
    "height",
    "bbox",
    "graticule",
    "northArrow",
    "scaleBar",
    "attribution",
  ] as const;

  for (const key of direct) {
    const v = args[key];
    if (v !== undefined) params[key] = v;
  }

  // `extra` is last so a caller can override anything above on purpose.
  if (args.extra) Object.assign(params, args.extra);

  return params as unknown as MapParams;
}

function toDataRows(values: NonNullable<CreateMapArgs["values"]>): DataRow[] {
  const rows: DataRow[] = [];

  for (const v of values) {
    if (v.color !== undefined && !isHexColor(v.color)) {
      throw new Error(
        `Invalid color ${JSON.stringify(v.color)} for ${v.id}. Use a 6-digit hex such as "#ff0000".`,
      );
    }

    if (v.category !== undefined) {
      if (v.value !== undefined) {
        throw new Error(
          `Region ${v.id} has both a value and a category. A map is either numeric or categorical, not both.`,
        );
      }
      rows.push({ kind: "label", id: v.id, label: v.category });
      continue;
    }

    if (v.value !== undefined) {
      rows.push(
        v.color
          ? { kind: "value", id: v.id, value: v.value, color: v.color }
          : { kind: "value", id: v.id, value: v.value },
      );
      continue;
    }

    if (v.color !== undefined) {
      rows.push({ kind: "color", id: v.id, color: v.color });
      continue;
    }

    throw new Error(
      `Region ${v.id} has no value, color, or category. Give it one, or move it to \`highlight\`.`,
    );
  }

  // The renderer rejects a mixed request; catching it here names the offending
  // ids instead of returning a 400 the model has to reverse-engineer.
  const numeric = rows.filter((r) => r.kind === "value");
  const labelled = rows.filter((r) => r.kind === "label");
  if (numeric.length > 0 && labelled.length > 0) {
    throw new Error(
      `Numeric values and text categories cannot mix in one map. ` +
        `Numeric: ${numeric.slice(0, 3).map((r) => r.id).join(", ")}. ` +
        `Categorical: ${labelled.slice(0, 3).map((r) => r.id).join(", ")}. ` +
        `Split them into two maps, or express the categories as numbers.`,
    );
  }

  return rows;
}

export function unknownScopeHint(scope: string): string | undefined {
  if (SCOPE_CODES.includes(scope)) return undefined;
  const upper = scope.toUpperCase();
  if (SCOPE_CODES.includes(upper)) {
    return `Scope "${scope}" should be "${upper}" — scope codes are case-sensitive.`;
  }
  return `Unknown scope "${scope}". Read maproll://catalog/scopes, or use "world".`;
}

export async function runCreateMap(args: CreateMapArgs) {
  const scopeProblem = unknownScopeHint(args.scope);
  if (scopeProblem) throw new Error(scopeProblem);

  const params = paramsFromArgs(args);
  const tag = { src: SRC_TAG };

  const svgUrl = buildUrl(params, { format: "svg", extraQuery: tag, base: API_BASE });
  const pngUrl = buildUrl(
    { ...params, width: params.width ?? PREVIEW_WIDTH },
    { format: "png", extraQuery: tag, base: API_BASE },
  );

  const preview = await fetchPreview(pngUrl);

  const warnings: string[] = [];
  if (preview.unknownIds.length > 0) {
    warnings.push(
      `The renderer did not recognise these ids and left them unstyled: ${preview.unknownIds.join(", ")}. Check they match the scope (ISO 3166-1 alpha-2 for world, ISO 3166-2 for a country scope).`,
    );
  }

  const structured = {
    svg_url: svgUrl,
    png_url: pngUrl,
    editor_url: editorUrl(svgUrl),
    embed: buildEmbed(params, args.title ?? "Map", { base: API_BASE }),
    warnings,
  };

  return {
    structuredContent: structured,
    content: [
      { type: "image" as const, data: preview.data, mimeType: "image/png" },
      { type: "text" as const, text: JSON.stringify(structured, null, 2) },
    ],
  };
}

/** Same query string, editor host — so the link carries the map, not just the app. */
function editorUrl(svgUrl: string): string {
  const query = new URL(svgUrl).search;
  return `${EDITOR_BASE}/${query}`;
}
