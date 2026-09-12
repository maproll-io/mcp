# Development

```bash
npm install
npm run typecheck
npm test
npm run inspect      # MCP Inspector against the local source
```

## Layout

```
src/
  index.ts          stdio entry point
  server.ts         transport-agnostic server construction
  constants.ts      API bases, the src tag, the env vars
  catalog.ts        the scope/theme/icon/projection/pattern catalogs
  examples.ts       worked examples, in create_map's argument shape
  grammar…          (published as resources, see resources.ts)
  places.ts         find_places, via the maproll edge
  render.ts         PNG fetch + X-Geo-Warnings parsing
  sign.ts           embed-safe URL tokens
  embed.ts          the <img> tag returned with every map
  resources.ts      the seven maproll:// resources
  prompts.ts        the three prompts
  tools/            create-map, add-layers, find-places, describe-options
worker/             mcp.maproll.io — the places edge and key minting
scripts/smoke.ts    end-to-end: real MCP, real API, writes a PNG
```

`server.ts` never names a transport, so the same tools ship over stdio today
and streamable HTTP on the Worker later.

The URL grammar lives in [`@maproll/map-url`](https://www.npmjs.com/package/@maproll/map-url),
shared with the editor. **It is not edited here** — a grammar change goes to
that package and comes back as a version bump. That package is also the source
of the scope catalog, so there is nothing to regenerate in this repo.

## The signing contract

`src/sign.ts` signs the URLs this server returns; `verifyUrlToken` in the render
API (`../api/src/lib/api-key.ts`) verifies them. The two canonicalisations must
agree byte for byte, and nothing at runtime will tell you when they stop
agreeing — a keyed map simply comes back with the wordmark on.

`tests/sign.test.ts` guards it by checking the signer against its own
reimplementation of the verifier. If you touch either side, run it, and read
`../api/concept/features/31-embed-safe-url-tokens.md` first.

Two traps in that file, both load-bearing:

- The token is appended as text. Re-serialising the query through
  `URLSearchParams` re-encodes what is already there (`data=US:1` becomes
  `data=US%3A1`) and invalidates the signature computed over it.
- Nothing is percent-decoded before hashing. Decoding makes `+` and `%20` the
  same input on one side and different on the other.

## The end-to-end smoke test

Exercises every tool, resource and prompt against a real stdio server and the
live API, then writes the rendered map to disk so it can be looked at.

```bash
npx wrangler dev --config worker/wrangler.toml --port 8795 &
MAPROLL_PLACES_URL=http://127.0.0.1:8795/places npx tsx scripts/smoke.ts
```

`SMOKE_OUT` sets where the PNG lands (default `/tmp/maproll-smoke.png`).

To exercise the keyed path, set `MAPROLL_API_KEY` to a key minted from the
editor. Without one the returned URLs are unsigned, which is the anonymous
behaviour and equally worth checking.

## Worker

`worker/` is the `mcp.maproll.io` edge: `/places` fronts the Supabase location
search, and `/keys` mints, lists and revokes API keys for the editor. It exists
so no credential ships inside a package that runs on the user's machine, and so
the backing store can change without every installed client needing an upgrade.

```bash
npx wrangler dev --config worker/wrangler.toml
npx wrangler deploy --config worker/wrangler.toml
```

## Publishing

`npm run check` runs on `prepublishOnly` and refuses to publish with a local
path dependency or a stale `dist/`. Bump the version in **both**
`package.json` and `server.json` — the MCP registry rejects a mismatch. Full
notes, including the registry's DNS authentication, are in
[PUBLISHING.md](PUBLISHING.md).
