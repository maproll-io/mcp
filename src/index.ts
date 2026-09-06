#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  // stdout carries the protocol; diagnostics must go to stderr or the client
  // sees a corrupted JSON-RPC stream.
  console.error("[maproll-mcp] fatal:", err);
  process.exit(1);
});
