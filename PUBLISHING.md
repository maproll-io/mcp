# Publishing

## npm

Published: [`@maproll/mcp`](https://www.npmjs.com/package/@maproll/mcp).

`npm run check` runs on `prepublishOnly` and refuses to publish with a local
path dependency or a stale `dist/`. `publishConfig.access` must stay
`"public"` — without it npm treats a scoped package as private and rejects
the publish with `E402 Payment Required`.

Bump `version` in **both** `package.json` and `server.json`; the registry
rejects a mismatch.

## MCP Registry

**Listed as `io.maproll/maproll`** — domain-verified namespace, status active.
Check it with:

```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=maproll"
```

The listing lives in `server.json`, validated with:

```bash
mcp-publisher validate
```

Constraints the validator enforces that are easy to miss:

- `description` is capped at **100 characters**. It is mirrored verbatim by
  every downstream directory (PulseMCP, Glama, mcp.so), so it is the one
  string worth writing carefully. Lead with the map, not the protocol.
- The server `name` must match the authentication method. `io.maproll/...`
  requires DNS authentication for `maproll.io`; GitHub auth would force
  `io.github.maproll-io/...` instead.

### DNS authentication

The keypair lives at `~/.config/maproll/mcp-registry-key.pem` (mode 600,
outside every repo — do not move it into one).

The public half **is already published** as a TXT record on the apex of
`maproll.io`, alongside the existing SPF and Google verification records:

```
maproll.io.  IN  TXT  "v=MCPv1; k=ed25519; p=<public key>"
```

The Cloudflare token that can edit this zone is `CLOUDFLARE_ACCOUNT_TOKEN` in
`~/projects/micropage-sh/.env` — note that the `CLOUDFLARE_DNS_API_TOKEN` in
`micropage-sh/publisher/.env` is scoped to `micropage.sh` only and cannot see
this zone.

Two traps called out by the registry docs:

- The record goes on the apex, **not** under a selector like
  `_mcp-auth.maproll.io`. MCP DNS auth follows SPF-style placement, not
  DKIM-style. A selector record fails with a generic signature error that
  does not mention the cause.
- On key rotation, delete the old TXT record. A stale one is tried first and
  fails verification.

Re-derive the record from the private key at any time:

```bash
openssl pkey -in ~/.config/maproll/mcp-registry-key.pem -pubout -outform DER \
  | tail -c 32 | base64
```

### Publishing the listing

Once the TXT record resolves:

```bash
PRIVATE_KEY="$(openssl pkey -in ~/.config/maproll/mcp-registry-key.pem -noout -text \
  | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain maproll.io --private-key "$PRIVATE_KEY"
mcp-publisher publish
```

`mcp-publisher` is a Go binary from the registry's GitHub releases, not the
npm package of the same name — that one is an unrelated MCP server.

## Directories

Checked 2026-09-06, the day the registry listing went live.

| Directory | State | Action |
| --- | --- | --- |
| Official MCP Registry | **Listed** as `io.maproll/maproll`, active | Done |
| PulseMCP | **Submissions paused** since 2026-09-03 | None possible |
| Glama | Not yet ingested | Wait |
| mcp.so | Not yet ingested | Wait |

PulseMCP's submit page says, verbatim: *"Apologies, submissions and changes
are temporarily paused"*, with no reopening date — *"rather than promise
another date we will simply reopen this page the moment we are ready."* It
redirects maintainers to publish to the official registry instead, and states
that listings will be picked up automatically once submissions reopen. That
is already done, so there is no submission to make and nothing is being
missed.

Re-check by opening https://www.pulsemcp.com/submit — the site returns 403 to
plain `curl`, so a browser or a fetch tool is needed.

When checking whether a directory has ingested the listing, confirm an actual
entry rather than grepping the page for "maproll": every search page echoes
the query term back, which reads as a false positive.
