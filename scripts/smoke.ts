/**
 * End-to-end smoke: spawn the real stdio server, speak real MCP, call the
 * tool, and write the returned PNG to disk so the map can be looked at.
 */
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(
  new StdioClientTransport({ command: "npx", args: ["tsx", "src/index.ts"] }),
);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const res = await client.callTool({
  name: "create_map",
  arguments: {
    scope: "world",
    title: "Coffee consumption per capita",
    subtitle: "kg per person per year",
    legendTitle: "kg / person",
    theme: "dark",
    values: [
      { id: "FI", value: 12 },
      { id: "NO", value: 9.9 },
      { id: "IS", value: 9 },
      { id: "DK", value: 8.7 },
      { id: "BR", value: 5.8 },
      { id: "US", value: 4.2 },
      { id: "DE", value: 5.5 },
      { id: "JP", value: 3.6 },
      { id: "XX", value: 1 },
    ],
  },
});

const content = res.content as Array<Record<string, unknown>>;
console.log("content blocks:", content.map((c) => c.type).join(", "));
console.log("structured:", JSON.stringify(res.structuredContent, null, 2));

const img = content.find((c) => c.type === "image");
if (img) {
  writeFileSync("/tmp/claude-1000/-home-cosmin-projects-maproll-io/face446b-b349-4dda-ac05-52d42fe7c398/scratchpad/smoke.png", Buffer.from(img.data as string, "base64"));
  console.log("wrote smoke.png", (img.data as string).length, "b64 chars");
}

await client.close();
