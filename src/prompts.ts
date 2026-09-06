import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

/**
 * Prompts, not tools, on purpose. Each of these is the host's own model doing
 * the thinking against maproll://grammar — no round trip to an Anthropic key
 * maproll would be paying for, and no latency between the request and the map.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "mapped_episode",
    {
      title: "Mapped-style map",
      description:
        "Turn a dataset into a map in the house style of Mapped, the weekly maproll series: the gap in the numbers stated plainly, editorial styling, publishable as-is.",
      argsSchema: z.object({
        dataset: z
          .string()
          .describe("The data, or a description of it. Numbers with their units."),
        angle: z
          .string()
          .optional()
          .describe("The surprise you want to lead with, if you already know it."),
      }),
    },
    ({ dataset, angle }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Make a map of this dataset in the Mapped house style.",
              "",
              "Dataset:",
              dataset,
              angle ? `\nThe angle to lead with: ${angle}` : "",
              "",
              "House style — follow it exactly:",
              "- Read maproll://grammar first if you have not already.",
              "- theme \"dark\". Navy oceans, warm land. This is the series' canvas.",
              "- The title states the subject plainly. No cleverness, no colon-subtitle constructions.",
              "- The subtitle carries the unit, so the numbers are unambiguous.",
              "- Set legendTitle to the unit as well.",
              "- attribution stays on.",
              "",
              "Then, in prose under the map, write two or three sentences in this voice:",
              "concrete, numeric, dry. Name the extremes and the gap between them.",
              "Example of the register: \"In Norway it's nine in ten; in the US it's one in ten;",
              "in Japan it's barely one in twenty-five.\"",
              "",
              "Do not write marketing copy. Do not say \"unlock\", \"insights\", or \"seamless\".",
              "Lead with the finding, not with the map.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "readme_map",
    {
      title: "Map for a README",
      description:
        "Make a map and return the markdown or HTML to paste into a README, docs page, or issue — with alt text that says what the map shows.",
      argsSchema: z.object({
        subject: z.string().describe("What the map should show."),
        format: z
          .enum(["markdown", "html"])
          .optional()
          .describe("Snippet flavour. Defaults to markdown."),
      }),
    },
    ({ subject, format }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Make a map showing: ${subject}`,
              "",
              "Then give me a paste-ready snippet, and nothing else around it.",
              `Format: ${format ?? "markdown"}.`,
              "",
              "- Use the svg_url. It renders in an <img> with no JavaScript and never expires.",
              "- Write real alt text: what the map shows and what the reader should take from it,",
              "  not \"map\" or \"chart image\".",
              "- Prefer a light theme; most READMEs render on a light ground.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "refine_map",
    {
      title: "Refine a map",
      description:
        "Change an existing map in plain English — \"make Ukraine blue\", \"add the airports\", \"switch to a diverging scale\".",
      argsSchema: z.object({
        map: z.string().describe("The map URL to change."),
        change: z.string().describe("What to change, in plain English."),
      }),
    },
    ({ map, change }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Here is a maproll map:\n${map}`,
              "",
              `Change it: ${change}`,
              "",
              "Read maproll://grammar if you have not already — the data encoding has four",
              "shapes and two of them cannot be combined.",
              "",
              "Keep everything the caller did not ask you to change. To add markers, routes,",
              "or region styling, pass this URL to add_layers rather than rebuilding the map",
              "from scratch, or you will drop what is already on it.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
