#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

/**
 * PugPage CLI Tool
 * Commands: init, dev, test, dist
 */
import { parseArgs } from "jsr:@std/cli";
import { initProject } from "./init.ts";
import { startDevServer } from "./dev.ts";

function printHelp() {
  console.log(`PugPage CLI
Usage: pugpage <command>

Commands:
  init    Initialize a new PugPage project
  dev     Start development server with live reload
  test    Run tests (Jest + jsdom)
  dist    Build application for production
`);
}

async function runTests() {
  console.log("Running tests with Jest and jsdom (watch mode)...");
  // TODO: Integrate with Jest, watch for file changes
}

async function buildDist() {
  console.log("Building application for production...");
  // TODO: Bundle Pug, JS, CSS, and assets
}

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  switch (args._[0]) {
    case "init":
      await initProject();
      break;
    case "dev":
      await startDevServer();
      break;
    case "test":
      await runTests();
      break;
    case "dist":
      await buildDist();
      break;
    default:
      printHelp();
      Deno.exit(1);
  }
}
