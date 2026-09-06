import { PLACES_URL, RENDER_TIMEOUT_MS, USER_AGENT } from "./constants.js";

export interface Place {
  name: string;
  kind: "country" | "region" | "city" | "airport";
  /** ISO 3166-1 alpha-2, ISO 3166-2, or IATA — whatever the map wants. */
  id: string | null;
  lat: number | null;
  lon: number | null;
  country: string;
  countryId: string;
  region: string | null;
  regionId: string | null;
}

/**
 * Resolve a place name through the maproll edge rather than talking to the
 * location store directly: a stdio server runs on the user's machine, so any
 * credential it holds is theirs, and a published package cannot be asked to
 * upgrade every time the backing store changes.
 */
export async function searchPlaces(
  query: string,
  opts: { kind?: string | undefined; limit?: number | undefined } = {},
): Promise<Place[]> {
  const url = new URL(PLACES_URL);
  url.searchParams.set("q", query);
  if (opts.kind) url.searchParams.set("kind", opts.kind);
  if (opts.limit !== undefined) url.searchParams.set("limit", String(opts.limit));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      `Could not reach the maproll place lookup at ${url.origin}. ` +
        `Coordinates cannot be guessed reliably — ask for them, or use ISO region ids instead of markers.`,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      /* fall through to the status line */
    }
    throw new Error(detail || `Place lookup failed (${res.status}).`);
  }

  const body = (await res.json()) as { places?: Place[] };
  return body.places ?? [];
}
