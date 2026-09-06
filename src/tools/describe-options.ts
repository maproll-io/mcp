import * as z from "zod";

import { CATALOGS, type CatalogKind } from "../catalog.js";

export const DescribeOptionsInput = z
  .object({
    kind: z
      .enum(["scopes", "themes", "icons", "projections", "patterns", "grammar"])
      .describe("Which catalog to return."),
  })
  .strict();

export type DescribeOptionsArgs = z.infer<typeof DescribeOptionsInput>;

/**
 * The same catalogs the resources expose. This tool exists because plenty of
 * MCP hosts never read resources, and a model that cannot list the themes
 * invents one.
 */
export function runDescribeOptions(args: DescribeOptionsArgs) {
  const body = CATALOGS[args.kind as CatalogKind];
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}
