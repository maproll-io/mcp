import { McpServer } from "@modelcontextprotocol/server";

import {
  CreateMapInput,
  CreateMapOutput,
  runCreateMap,
  type CreateMapArgs,
} from "./tools/create-map.js";

/**
 * Builds the server. Transport-agnostic on purpose: the stdio entry point and
 * the Cloudflare Worker both call this, so a tool is written once and shipped
 * three ways (stdio, streamable HTTP, .mcpb).
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "maproll",
    version: "0.0.1",
  });

  server.registerTool(
    "create_map",
    {
      title: "Create a map",
      description: `Make a production-ready static map and return its URL plus a rendered preview.

The map is a URL: the returned svg_url renders the same image forever, embeds in an <img> tag with no JavaScript, and is the handle other maproll tools accept.

Use it for choropleths (numeric values per region), flat colour paints, qualitative category maps, and plain highlight maps. Region ids are ISO 3166-1 alpha-2 at the "world" scope ("US", "DE", "BR") and ISO 3166-2 inside a country scope ("RO-B", "RO-CJ").

Numeric values and text categories cannot appear in the same map — pick one.

Do not use it for interactive or zoomable maps, driving directions, or street-level detail; maproll renders static statistical maps, not a slippy map.`,
      inputSchema: CreateMapInput,
      outputSchema: CreateMapOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: CreateMapArgs) => runCreateMap(args),
  );

  return server;
}
