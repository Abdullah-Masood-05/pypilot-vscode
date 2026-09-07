/**
 * build.ts — Bun-native build script for the PyPilot VSCode extension.
 *
 * Bun has a built-in bundler (`Bun.build`) so we don't need esbuild as a
 * devDependency. Run with:
 *   bun run build.ts           # one-shot build
 *   bun run build.ts --watch   # incremental watch mode
 */

import { watch as fsWatch } from "fs";
import { join } from "path";

const watchMode = process.argv.includes("--watch");

async function build(): Promise<void> {
  const result = await Bun.build({
    entrypoints: ["./src/extension.ts"],
    outdir: "./out",
    target: "node",          // Bun target: generates Node-compatible CJS output.
    format: "cjs",           // VSCode extensions must be CJS.
    external: ["vscode"],    // Provided by the host at runtime — never bundle it.
    sourcemap: "linked",
    minify: false,           // Keep readable; set to true for a release build.
    naming: "[dir]/[name].js",
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const msg of result.logs) {
      console.error(" ", msg);
    }
    process.exit(1);
  }

  const now = new Date().toLocaleTimeString();
  console.log(`[${now}] Built ${result.outputs.length} file(s) to ./out`);
}

// Run the first build immediately.
await build();

if (watchMode) {
  console.log("Watching src/ for changes… (Ctrl-C to stop)");

  // Bun.build doesn't have a built-in watch API yet; use fs.watch as a trigger.
  const srcDir = join(import.meta.dir, "src");
  fsWatch(srcDir, { recursive: true }, async (event, filename) => {
    if (filename?.endsWith(".ts")) {
      console.log(`Changed: ${filename}`);
      await build().catch(console.error);
    }
  });

  // Keep the process alive.
  await new Promise(() => {});
}
