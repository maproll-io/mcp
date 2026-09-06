import { McpServer } from "@modelcontextprotocol/server";

import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import {
  AddLayersInput,
  AddLayersOutput,
  runAddLayers,
  type AddLayersArgs,
} from "./tools/add-layers.js";
import {
  CreateMapInput,
  CreateMapOutput,
  runCreateMap,
  type CreateMapArgs,
} from "./tools/create-map.js";
import {
  DescribeOptionsInput,
  runDescribeOptions,
  type DescribeOptionsArgs,
} from "./tools/describe-options.js";
import {
  FindPlacesInput,
  FindPlacesOutput,
  runFindPlaces,
  type FindPlacesArgs,
} from "./tools/find-places.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * Builds the server. Transport-agnostic on purpose: the stdio entry point and
 * the Cloudflare Worker both call this, so a tool is written once and shipped
 * three ways (stdio, streamable HTTP, .mcpb).
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "maproll", version: "0.1.0" });

  server.registerTool(
    "create_map",
    {
      title: "Create a map",
      description: `Make a production-ready static map and return its URL plus a rendered preview.

The map is a URL: the returned svg_url renders the same image forever, embeds in an <img> tag with no JavaScript, and is the handle the other maproll tools accept.

Use it for choropleths (numeric values per region), flat colour paints, qualitative category maps, and plain highlight maps. Region ids are ISO 3166-1 alpha-2 at the "world" scope ("US", "DE", "BR") and ISO 3166-2 inside a country scope ("RO-B", "RO-CJ").

Numeric values and text categories cannot appear in the same map — pick one.

Do not use it for interactive or zoomable maps, driving directions, or street-level detail; maproll renders static statistical maps, not a slippy map.`,
      inputSchema: CreateMapInput,
      outputSchema: CreateMapOutput,
      annotations: READ_ONLY,
    },
    async (args: CreateMapArgs) => runCreateMap(args),
  );

  server.registerTool(
    "add_layers",
    {
      title: "Add layers to a map",
      description: `Add markers, routes, proportional circles, pattern fills, annotations or labels to an existing map, and return the new URL.

Takes the svg_url of a map you already made. Everything on it is kept — this appends rather than replaces, so it is also how you build a map up over several turns.

Resolve coordinates with find_places before adding a marker. Guessed lat/lon lands in the wrong country and the render will not complain.

Use sea routes for shipping: they follow the lanes through Suez, Panama and Malacca instead of drawing a straight line over land.`,
      inputSchema: AddLayersInput,
      outputSchema: AddLayersOutput,
      annotations: READ_ONLY,
    },
    async (args: AddLayersArgs) => runAddLayers(args),
  );

  server.registerTool(
    "find_places",
    {
      title: "Find a place",
      description: `Resolve a place name to real coordinates and the region id maproll uses.

Searches countries, regions, cities and airports, and returns each hit's ISO 3166-1 / 3166-2 / IATA code alongside its latitude and longitude.

Use it before placing any marker or lat,lon route endpoint. Coordinates recalled from memory are frequently wrong by degrees, and a map renders a wrong marker exactly as confidently as a right one.`,
      inputSchema: FindPlacesInput,
      outputSchema: FindPlacesOutput,
      annotations: READ_ONLY,
    },
    async (args: FindPlacesArgs) => runFindPlaces(args),
  );

  server.registerTool(
    "describe_options",
    {
      title: "List what the renderer accepts",
      description: `Return the exact accepted values for scopes, themes, marker icons, projections, pattern fills, or the URL grammar.

The same content is published as the maproll:// resources; this tool is for hosts that do not read resources. Check it rather than guessing a name — an icon or theme that does not exist renders nothing and reports no error.`,
      inputSchema: DescribeOptionsInput,
      annotations: { ...READ_ONLY, openWorldHint: false },
    },
    async (args: DescribeOptionsArgs) => runDescribeOptions(args),
  );

  registerResources(server);
  registerPrompts(server);

  return server;
}
