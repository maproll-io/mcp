import { createRequire } from "node:module";

/**
 * The server's version, read from package.json so there is one place to bump.
 * A hardcoded string here drifted to 0.1.0 while npm shipped 0.2.1. The path
 * resolves from both src/ (tsx) and dist/ (published), and npm always ships
 * package.json.
 */
export const VERSION: string = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;
