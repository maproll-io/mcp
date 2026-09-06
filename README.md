# @maproll/mcp

MCP server for [maproll](https://www.maproll.io) — make production-ready static maps from a URL.

Every map is a URL. This server gives an agent a typed way to build one, and
returns the rendered map alongside it.

> **Status: M0 spike.** One tool, no resources or prompts yet, not published.
> See the plan for what M1 adds.

## Try it

```bash
npm install
npm run inspect      # MCP Inspector against the local source
npx tsx scripts/smoke.ts   # end-to-end: real MCP, real API, writes a PNG
```

Wire it into a client:

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

No API key. Anonymous renders carry the maproll wordmark; a token (later)
makes `logo` a parameter the caller controls.

## Tools

### `create_map`

Structured data in, a map URL and a rendered PNG out.

```jsonc
{
  "scope": "world",
  "title": "Coffee consumption per capita",
  "values": [
    { "id": "FI", "value": 12 },
    { "id": "US", "value": 4.2 }
  ]
}
```

Returns `svg_url`, `png_url`, `editor_url`, a ready `embed` tag, and any
`warnings` (e.g. region ids the renderer did not recognise). The `svg_url`
is also the **state handle** — later tools take it and return a new one, so
there is no session to keep.

`editor_url` opens the map in `app.maproll.io` with everything loaded and
editable; the editor reads the query string back into state via its
`parseUrl`.

Data arrives structured rather than as the packed `US:200:#ff0000` wire form.
That grammar is a serialisation detail; the server owns it.

## Layout

```
src/
  index.ts          # stdio entry point
  server.ts         # transport-agnostic server construction
  map-url.ts        # the URL grammar — seed of the @maproll/map-url package
  scopes.ts         # GENERATED from editor/src/lib/scopes.ts
  render.ts         # PNG fetch + X-Geo-Warnings parsing
  tools/
    create-map.ts
scripts/smoke.ts    # end-to-end check
```

`server.ts` never mentions a transport, so the same tools ship over stdio
today and streamable HTTP on a Worker later.

## Known gaps

- `map-url.ts` is a copy of the editor's builder. M1 extracts it to
  `@maproll/map-url` and both sides import it.
- No resources, prompts, `add_layers`, or `find_places` yet.

## Regenerating the scope catalog

`src/scopes.ts` is generated from `editor/src/lib/scopes.ts`. It is checked in
so the package is self-contained; regenerate it when scopes change.
