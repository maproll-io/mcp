import * as z from "zod";

import { API_BASE, EDITOR_BASE, PREVIEW_WIDTH, SRC_TAG } from "../constants.js";
import {
  buildUrl,
  isHexColor,
  parseUrl,
  type MapParams,
  type MarkerEntry,
  type RouteEntry,
} from "@maproll/map-url";
import { embedTag } from "../embed.js";
import { fetchPreview } from "../render.js";
import { signUrl, stripSignature } from "../sign.js";

const Marker = z
  .object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    icon: z
      .string()
      .optional()
      .describe(
        'One of the 30 built-in icons ("pin", "airport", "ship", "factory", "warning"…). Read maproll://catalog/icons; an invented name renders nothing.',
      ),
    sidc: z
      .string()
      .optional()
      .describe("A 20- or 30-digit APP-6 / MIL-STD-2525 code, instead of `icon`."),
    label: z.string().max(120).optional(),
    labelPosition: z
      .enum(["top", "bottom", "left", "right"])
      .optional()
      .describe('Caption placement. Use "bottom" for military symbols.'),
    size: z.number().int().min(1).max(200).optional(),
  })
  .strict();

const Route = z
  .object({
    from: z.string().describe('ISO code ("RO") or a "lat,lon" literal.'),
    to: z.string(),
    color: z.string().optional().describe('6-digit hex, e.g. "#ff0000".'),
    width: z.number().min(0.1).max(100).optional(),
    style: z.enum(["solid", "dashed"]).optional(),
    arrow: z.boolean().optional(),
    sea: z
      .boolean()
      .optional()
      .describe(
        "Follow shipping lanes through Suez / Panama / Malacca instead of cutting a great circle over land.",
      ),
  })
  .strict();

export const AddLayersInput = z
  .object({
    map: z
      .string()
      .describe("A map URL from a previous call. Everything already on it is kept."),
    markers: z.array(Marker).max(1000).optional().describe("Points to add."),
    routes: z.array(Route).max(500).optional().describe("A→B lines to add."),
    proportional: z
      .array(
        z.object({
          id: z.string(),
          value: z.number(),
          color: z.string().optional(),
        }).strict(),
      )
      .optional()
      .describe("Circles at region centroids, area proportional to value."),
    patterns: z
      .array(
        z.object({
          id: z.string(),
          pattern: z.enum([
            "stripes",
            "stripes-diagonal",
            "dots",
            "crosshatch",
            "solid-outline",
          ]),
        }).strict(),
      )
      .optional()
      .describe("Per-region texture fills, for hatching a category onto a choropleth."),
    annotations: z
      .array(z.object({ id: z.string(), text: z.string().max(200) }).strict())
      .optional()
      .describe("Per-region tooltip text."),
    labels: z
      .union([z.literal("ISO"), z.array(z.string())])
      .optional()
      .describe('"ISO" labels every large region; an array labels only those ids.'),
  })
  .strict();

export const AddLayersOutput = z.object({
  svg_url: z.string(),
  png_url: z.string(),
  editor_url: z.string(),
  embed: z.string(),
  warnings: z.array(z.string()),
});

export type AddLayersArgs = z.infer<typeof AddLayersInput>;

/** `id:value` pair lists append rather than replace, matching the layer model. */
function appendPairs(existing: string | undefined, additions: string[]): string {
  const parts = existing ? existing.split(",").filter(Boolean) : [];
  return [...parts, ...additions].join(",");
}

export function applyLayers(args: AddLayersArgs): {
  params: MapParams;
  markers: MarkerEntry[];
  routes: RouteEntry[];
} {
  const current = parseUrl(args.map);
  const params: Record<string, unknown> = { ...current.params };

  for (const m of args.markers ?? []) {
    if (m.icon && m.sidc) {
      throw new Error(
        `Marker at ${m.lat},${m.lon} has both icon and sidc. Pick one — a SIDC replaces the icon.`,
      );
    }
  }

  for (const r of args.routes ?? []) {
    if (r.color !== undefined && !isHexColor(r.color)) {
      throw new Error(
        `Route ${r.from}>${r.to} has color ${JSON.stringify(r.color)}. Use a 6-digit hex such as "#ff0000".`,
      );
    }
  }

  if (args.proportional?.length) {
    for (const p of args.proportional) {
      if (p.color !== undefined && !isHexColor(p.color)) {
        throw new Error(
          `Proportional entry ${p.id} has color ${JSON.stringify(p.color)}. Use a 6-digit hex.`,
        );
      }
    }
    params.proportional = appendPairs(
      current.params.proportional,
      args.proportional.map((p) => (p.color ? `${p.id}:${p.value}:${p.color}` : `${p.id}:${p.value}`)),
    );
  }

  if (args.patterns?.length) {
    params.patterns = appendPairs(
      current.params.patterns,
      args.patterns.map((p) => `${p.id}:${p.pattern}`),
    );
  }

  if (args.annotations?.length) {
    params.annotations = appendPairs(
      current.params.annotations,
      // `,` and `:` are the pair delimiters; annotation text is free-form.
      // Collapse the whitespace afterwards so "Election: 2024" does not come
      // back with a double space where the colon was.
      args.annotations.map(
        (a) => `${a.id}:${a.text.replace(/[,:]/g, " ").replace(/\s+/g, " ").trim()}`,
      ),
    );
  }

  if (args.labels) {
    params.labels = Array.isArray(args.labels) ? args.labels.join(",") : args.labels;
  }

  return {
    params: params as unknown as MapParams,
    markers: [...current.markers, ...((args.markers ?? []) as MarkerEntry[])],
    routes: [...current.routes, ...((args.routes ?? []) as RouteEntry[])],
  };
}

export async function runAddLayers(args: AddLayersArgs) {
  const { params, markers, routes } = applyLayers(args);
  const tag = { src: SRC_TAG };
  const opts = { markers, routes, base: API_BASE, extraQuery: tag };

  // parseUrl dropped any k/t the incoming map carried (they are not map
  // params), so a signed URL passed back in is simply re-signed over the new
  // query — which is what keeps a multi-turn build wordmark-free throughout.
  const svgUrl = signUrl(buildUrl(params, { ...opts, format: "svg" }));
  const pngUrl = signUrl(
    buildUrl({ ...params, width: params.width ?? PREVIEW_WIDTH }, { ...opts, format: "png" }),
  );

  const preview = await fetchPreview(pngUrl);

  const warnings: string[] = [];
  if (preview.unknownIds.length > 0) {
    warnings.push(
      `The renderer did not recognise these ids: ${preview.unknownIds.join(", ")}.`,
    );
  }

  const structured = {
    svg_url: svgUrl,
    png_url: pngUrl,
    editor_url: `${EDITOR_BASE}/${new URL(stripSignature(svgUrl)).search}`,
    embed: embedTag(svgUrl, params.title ?? "Map"),
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
