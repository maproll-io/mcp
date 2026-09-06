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

The public half is published as a TXT record on the **apex** of `maproll.io`:

```
maproll.io.  IN  TXT  "v=MCPv1; k=ed25519; p=<public key>"
```

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
