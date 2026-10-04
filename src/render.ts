import { RENDER_TIMEOUT_MS, USER_AGENT } from "./constants.js";

export interface RenderedPreview {
  /** base64 PNG, ready for an image content block. */
  data: string;
  /** Ids the renderer did not recognise, from the X-Geo-Warnings header. */
  unknownIds: string[];
}

/**
 * A preview that could not be fetched. The URLs are still valid, so the call
 * succeeds and says why the picture is missing.
 */
export interface PreviewUnavailable {
  data: null;
  unknownIds: [];
  warning: string;
}

/**
 * Fetch a PNG of the map so the caller sees the actual result rather than a
 * promise of one. A failed preview is not a failed tool call — the URL is
 * still valid and useful — so this throws only on a 4xx, which means the map
 * itself is wrong (unknown scope, bad parameter) and every URL would fail the
 * same way. A timeout, network error or 5xx comes back as a warning.
 */
export async function fetchPreview(
  pngUrl: string,
): Promise<RenderedPreview | PreviewUnavailable> {
  let res: Response;
  try {
    res = await fetch(pngUrl, {
      headers: { "user-agent": USER_AGENT, accept: "image/png" },
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return unavailable(
      timedOut
        ? `The preview did not render within ${RENDER_TIMEOUT_MS / 1000}s.`
        : "The preview could not be fetched (network error).",
    );
  }

  if (res.status >= 400 && res.status < 500) {
    throw new Error(await describeApiError(res));
  }
  if (!res.ok) {
    return unavailable(`The preview failed: ${await describeApiError(res)}`);
  }

  const buf = await res.arrayBuffer();
  return {
    data: Buffer.from(buf).toString("base64"),
    unknownIds: parseGeoWarnings(res.headers.get("x-geo-warnings")),
  };
}

function unavailable(reason: string): PreviewUnavailable {
  return {
    data: null,
    unknownIds: [],
    warning: `${reason} The URLs are valid; open svg_url to see the map.`,
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
