/**
 * Publish guard. Two ways this package can ship broken, both of which a
 * `npm pack` dry-run showed happening for real:
 *
 *  - a `file:` dependency, which resolves to a path that exists only on the
 *    machine that published it, so `npx -y @maproll/mcp` fails for everyone;
 *  - stale files in dist/, because tsc does not clean up after deleted
 *    sources (dist/map-url.js survived long after src/map-url.ts was gone).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const problems = [];

for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
  if (/^(file:|link:|portal:)/.test(range)) {
    problems.push(
      `dependency "${name}" is "${range}" — a local path. Publish ${name} first, ` +
        `then set a version range (e.g. "^0.1.0") here.`
    );
  }
}

// Every emitted .js must trace back to a source file of the same name.
if (existsSync("dist")) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );
  for (const file of walk("dist")) {
    if (!file.endsWith(".js")) continue;
    const src = file.replace(/^dist[\\/]/, "src/").replace(/\.js$/, ".ts");
    if (!existsSync(src)) {
      problems.push(`dist file "${file}" has no source at "${src}" — stale build. Run a clean build.`);
    }
  }
}

if (problems.length > 0) {
  console.error("Not publishable:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("publishable: no local-path deps, no stale dist files");
