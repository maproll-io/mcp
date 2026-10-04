#!/bin/sh
# Publishes server.json to the MCP registry. Runs as npm's postpublish hook,
# so `npm publish` updates npm and the registry in one go — the registry
# listing used to stay behind (0.2.0) because this was a separate manual step.
#
#   sh scripts/publish-registry.sh            log in and publish
#   sh scripts/publish-registry.sh --dry-run  log in and validate only
#
# The DNS signing key comes from MCP_DNS_PRIVATE_KEY (hex ed25519 seed) or,
# failing that, the PEM at ~/.config/maproll/mcp-registry-key.pem.
set -eu

# `npm publish --dry-run` still runs this hook; publishing for real here would
# list a version npm does not have.
if [ "${npm_config_dry_run:-}" = "true" ]; then
  echo "publish-registry: npm dry run, skipping the registry."
  exit 0
fi

# Pinned and checksummed: this binary is handed the signing key. To upgrade,
# take the hash from that release's registry_<version>_checksums.txt.
PUBLISHER_VERSION=v1.8.1
PUBLISHER_SHA256=a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc
PEM="${MCP_REGISTRY_KEY_PEM:-$HOME/.config/maproll/mcp-registry-key.pem}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_amd64 ;;
  *) echo "publish-registry: no pinned checksum for $(uname -s)-$(uname -m); add one." >&2; exit 1 ;;
esac

bin_dir="node_modules/.cache/mcp-publisher-$PUBLISHER_VERSION"
bin="$bin_dir/mcp-publisher"
if [ ! -x "$bin" ]; then
  mkdir -p "$bin_dir"
  curl -fsSL -o "$bin_dir/publisher.tar.gz" \
    "https://github.com/modelcontextprotocol/registry/releases/download/$PUBLISHER_VERSION/mcp-publisher_$platform.tar.gz"
  echo "$PUBLISHER_SHA256  $bin_dir/publisher.tar.gz" | sha256sum -c - >/dev/null
  tar xzf "$bin_dir/publisher.tar.gz" -C "$bin_dir" mcp-publisher
  rm "$bin_dir/publisher.tar.gz"
fi

key="${MCP_DNS_PRIVATE_KEY:-}"
if [ -z "$key" ]; then
  [ -r "$PEM" ] || { echo "publish-registry: no MCP_DNS_PRIVATE_KEY and no key at $PEM." >&2; exit 1; }
  key="$(openssl pkey -in "$PEM" -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
fi

"$bin" login dns --domain maproll.io --private-key "$key" >/dev/null
if [ "${1:-}" = "--dry-run" ]; then
  "$bin" validate
else
  "$bin" publish
fi
