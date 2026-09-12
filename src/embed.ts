/**
 * The paste-ready `<img>` tag returned alongside every map.
 *
 * Built from the finished URL rather than rebuilt from params — which is what
 * `buildEmbed` in @maproll/map-url does — because the URL is the thing that
 * carries the `src` tag and the entitlement token. Rebuilding from params
 * silently produced an embed that pointed at a *different* render than
 * `svg_url` did.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function embedTag(url: string, altText: string): string {
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(altText || "Map")}" />`;
}
