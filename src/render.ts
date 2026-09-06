import { RENDER_TIMEOUT_MS, USER_AGENT } from "./constants.js";

export interface RenderedPreview {
  /** base64 PNG, ready for an image content block. */
  data: string;
  /** Ids the renderer did not recognise, from the X-Geo-Warnings header. */
  unknownIds: string[];
}

/**
 * Fetch a PNG of the map so the caller sees the actual result rather than a
 * promise of one. A failed preview is not a failed tool call — the URL is
 * still valid and useful — so this throws only on a real API error and the
 * caller decides what to do with a transport failure.
 */
export async function fetchPreview(pngUrl: string): Promise<RenderedPreview> {
  const res = await fetch(pngUrl, {
    headers: { "user-agent": USER_AGENT, accept: "image/png" },
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(await describeApiError(res));
  }

  const buf = await res.arrayBuffer();
  return {
    data: Buffer.from(buf).toString("base64"),
    unknownIds: parseGeoWarnings(res.headers.get("x-geo-warnings")),
  };
}

/**
 * The API returns a consistent JSON error shape; surface its message rather
 * than a bare status code, because the message names the fix (which scopes
 * exist, which themes are valid).
 */
async function describeApiError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    detail = body.message ?? body.error ?? "";
  } catch {
    /* non-JSON body — fall through to the status line */
  }
  return detail
    ? `maproll API ${res.status}: ${detail}`
    : `maproll API returned ${res.status} ${res.statusText}.`;
}

/** `X-Geo-Warnings: unknown-ids:XX,YY` */
function parseGeoWarnings(header: string | null): string[] {
  if (!header) return [];
  const out: string[] = [];
  for (const part of header.split(";")) {
    const [key, value] = part.split(":");
    if (key?.trim() === "unknown-ids" && value) {
      out.push(...value.split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return out;
}
