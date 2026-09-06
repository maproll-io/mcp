export const API_BASE = "https://api.maproll.io";
export const EDITOR_BASE = "https://app.maproll.io";

/**
 * Place lookups go through the maproll edge, never straight to the location
 * store — see src/places.ts. Overridable so the Worker can be run locally.
 */
export const PLACES_URL =
  process.env.MAPROLL_PLACES_URL ?? "https://mcp.maproll.io/places";

/**
 * Tags every render this server produces. Two jobs: it lets the API edge
 * separate MCP-driven traffic from editor traffic in analytics, and it is
 * the condition the watermark policy keys on (src=mcp + no key => logo on).
 * Do not drop it to make a URL prettier.
 */
export const SRC_TAG = "mcp";

/** Width of the PNG returned as an image block. Big enough to read, small
 *  enough not to blow up a chat transcript. */
export const PREVIEW_WIDTH = 900;

/** Renders are cached hard upstream, but a cold render still has to project
 *  and serialise geometry. */
export const RENDER_TIMEOUT_MS = 20_000;

export const USER_AGENT = "maproll-mcp";
