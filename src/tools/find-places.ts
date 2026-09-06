import * as z from "zod";

import { searchPlaces } from "../places.js";

export const FindPlacesInput = z
  .object({
    query: z
      .string()
      .min(2)
      .describe('Place name to resolve, e.g. "Constanța", "Suez", "Heathrow".'),
    kind: z
      .enum(["country", "region", "city", "airport"])
      .optional()
      .describe("Narrow the search. Omit to search all four."),
    limit: z.number().int().min(1).max(25).optional().describe("Default 10."),
  })
  .strict();

export const FindPlacesOutput = z.object({
  places: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      id: z.string().nullable().describe("ISO 3166-1 / 3166-2 / IATA code."),
      lat: z.number().nullable(),
      lon: z.number().nullable(),
      country: z.string(),
      countryId: z.string(),
      region: z.string().nullable(),
      regionId: z.string().nullable(),
    }),
  ),
});

export type FindPlacesArgs = z.infer<typeof FindPlacesInput>;

export async function runFindPlaces(args: FindPlacesArgs) {
  const places = await searchPlaces(args.query, {
    kind: args.kind,
    limit: args.limit,
  });

  if (places.length === 0) {
    return {
      structuredContent: { places: [] },
      content: [
        {
          type: "text" as const,
          text:
            `No place matched ${JSON.stringify(args.query)}` +
            (args.kind ? ` with kind "${args.kind}"` : "") +
            `. Try the local spelling, a shorter prefix, or drop the kind filter.`,
        },
      ],
    };
  }

  const structured = { places };
  return {
    structuredContent: structured,
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
  };
}
