#!/usr/bin/env bun

import path from "path"
import { fileURLToPath } from "url"
import solidPlugin from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

console.log("Building MikuChat TUI...")

await Bun.build({
  conditions: ["browser"],
  tsconfig: "./tsconfig.json",
  plugins: [solidPlugin],
  entrypoints: ["./src/main.tsx"],
  outdir: "./dist",
  target: "bun",
  sourcemap: "external",
  define: {
    OPENCODE_VERSION: "'0.1.0'",
    OPENCODE_WORKER_PATH: "'./src/tui/worker.ts'",
  },
})

console.log("Build complete → dist/")
