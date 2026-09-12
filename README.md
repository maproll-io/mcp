# @maproll/mcp

Let an AI assistant make real maps. Every map comes back as a maproll URL — permanent, embeddable, and the handle for the next change.

![World choropleth of coffee consumption per capita, made through the maproll MCP server](https://api.maproll.io/map.png?scope=world&data=FI:12,NO:9.9,IS:9,DK:8.7,BR:5.8,DE:5.5,US:4.2,JP:3.6&theme=dark&width=1200&legendTitle=kg%20%2F%20person&title=Coffee%20consumption%20per%20capita&subtitle=kg%20per%20person%20per%20year)

That image is not a file in this repository. It is a maproll URL rendering live, which is the whole idea: **the URL is the map.**

## Install

```bash
claude mcp add maproll -- npx -y @maproll/mcp
```

Any other client takes the same command as config — Claude Desktop, Cursor
(`.cursor/mcp.json`), VS Code (`.vscode/mcp.json` under `"servers"`):

```json
{
  "mcpServers": {
    "maproll": {
      "command": "npx",
      "args": ["-y", "@maproll/mcp"]
    }
  }
}
```

Needs Node 20 or newer. No API key, no signup, no account — the server runs
from npm on demand and talks to the public render API.

## Try it

Ask your assistant, in these words or your own:

> Map coffee consumption per capita for the ten biggest drinkers.

> Highlight the EU member states on a light map.

> Draw the sea route from Shanghai to Rotterdam, with the ports marked.

> Compare NATO and BRICS members on a dark map, and give me a URL I can embed.

The third one is the one to try if you only try one. Sea routes thread Suez,
Panama and Malacca instead of drawing a straight line across Asia:

![Sea route from Shanghai to Rotterdam through the Suez canal, with both ports marked](https://api.maproll.io/map.png?scope=world&theme=dark&width=1200&title=Shanghai%20to%20Rotterdam&subtitle=Sea%20route%20through%20Suez&routes=31.23,121.47%3E51.92,4.48:sea:arrow&markers=31.23,121.47:ship:Shanghai;51.92,4.48:anchor:Rotterdam)

## Tools

### `create_map`

A map from your data. Numeric values give a choropleth, colours paint regions
flat, text values give qualitative buckets, and `highlight` covers the case
where the point is *which* regions rather than *how much*.

Region ids are ISO 3166-1 alpha-2 at the world scope (`US`, `DE`, `BR`) and ISO
3166-2 inside a country scope (`RO-B`, `RO-CJ`). Data arrives structured — the
server owns the URL grammar, so the model never hand-assembles `US:200:#ff0000`.

### `add_layers`

Markers, routes, proportional circles, pattern fills, annotations and labels,
added to a map you already made. It takes that map's URL and **appends** — so
it is also how a map gets built up over several turns instead of rebuilt from
scratch each time.

### `find_places`

A place name resolved to real coordinates and the id maproll uses. Countries,
regions, cities and airports, each with its ISO 3166-1 / 3166-2 / IATA code.

Worth using before every marker. Coordinates recalled from memory are routinely
wrong by degrees, and a map draws a wrong marker exactly as confidently as a
right one.

### `describe_options`

The scopes, themes, marker icons, projections and pattern fills the renderer
actually accepts. An invented theme or icon name renders nothing and reports no
error, so checking beats guessing.

## What comes back

Every tool that makes a map returns the rendered PNG to look at, plus:

| Field | What it is |
| --- | --- |
| `svg_url` | The map. Embeddable, permanent, and the handle the other tools take. |
| `png_url` | The same map as PNG. |
| `editor_url` | Opens it in the maproll editor, loaded and editable. |
| `embed` | A ready `<img>` tag. |
| `warnings` | Non-fatal problems — region ids the renderer did not recognise, for instance. |

## Why the URL is the map

An agent usually hands back an artifact: a file, a blob, something that exists
in the conversation and nowhere else. maproll hands back an address.

```
prompt → assistant → maproll MCP → https://api.maproll.io/map.svg?…
                                        ↓
              README · docs · dashboard · newsletter · the next tool call
```

There is no session and no state to keep, because `svg_url` **is** the state.
Pass it to `add_layers` and a new URL comes back with the addition applied.
Every URL from every step still renders, forever, in an `<img>` tag with no
JavaScript.

## Branding and keys

Maps work with no account. What anonymous costs is the wordmark: every map this
server makes carries the small maproll mark in the corner.

A key removes it. Mint one in the editor at
[app.maproll.io](https://app.maproll.io) → API keys, and pass it in the
server's environment:

```json
{
  "mcpServers": {
    "maproll": {
      "command": "npx",
      "args": ["-y", "@maproll/mcp"],
      "env": { "MAPROLL_API_KEY": "mr_live_…" }
    }
  }
}
```

With a key, returned URLs carry a signature bound to that one map, so an
embedded map renders clean wherever it is published — without the key itself
ever appearing in a link someone can copy. Two things worth knowing: keys
expire after 90 days, and when one expires, embeds published under it start
carrying the wordmark again. Regenerate the maps if that matters.

OpenStreetMap attribution stays on either way. That is a licence obligation,
not branding.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAPROLL_API_KEY` | — | Entitles renders, and removes the wordmark. |
| `MAPROLL_PLACES_URL` | `https://mcp.maproll.io/places` | Where `find_places` resolves names. Override only for local development. |

## Resources and prompts

Seven read-only resources publish the catalogs a model otherwise guesses at —
`maproll://grammar` most of all, plus the scope, theme, icon, projection and
pattern lists and a set of worked examples.

Three prompts ship with the server: `mapped_episode` (a dataset in the house
style of [Mapped](https://www.maproll.io/content)), `readme_map` (a map plus a
paste-ready snippet with real alt text), and `refine_map` (change an existing
map in plain English).

## Documentation

- [maproll.io/mcp](https://www.maproll.io/mcp) — what this is, in one page.
- [docs.maproll.io/docs/mcp/intro](https://docs.maproll.io/docs/mcp/intro) —
  per-client install, every tool's schema, recipes.
- Listed in the MCP Registry as `io.maproll/maproll`.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for the layout, the local loop, and the
end-to-end smoke test. Publishing notes are in [PUBLISHING.md](PUBLISHING.md).

MIT licensed.
