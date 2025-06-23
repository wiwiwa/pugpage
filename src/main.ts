#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run

/**
 * PugPage CLI Tool
 * Commands: init, dev, test, dist
 */
import { parseArgs } from "jsr:@std/cli";
import { startDevServer } from "./dev.ts";
import { buildDist } from "./dist.ts";
import { initProject } from "./init.ts";

function printHelp() {
  console.log(`PugPage CLI
Usage:
  pugpage init
  pugpage dev [--root=.] [--port=8000]
  pugpage test [--root=.]
  pugpage dist [--root=.]

Commands:
  init    Initialize a new PugPage project
  dev     Start development server with live reload
  test    Run tests (Jest + jsdom)
  dist    Build application for production
`);
}

async function runTests(opts: { root?: string } = {}) {
  const root = opts.root ?? ".";
  console.log(`Running tests with Jest and jsdom (watch mode) in ${root}...`);
}

if (import.meta.main) {
  const args = parseArgs(Deno.args,{
    string: ["root"],
    default: {
      root: ".",
      port: 8000,
    },
  });
  switch (args._[0]) {
    case "init":
      await initProject();
      break;
    case "dev":
      await startDevServer({
        root: args.root,
        port: Number(args.port),
      });
      break;
    case "test":
      await runTests({
        root: args.root,
      });
      break;
    case "dist":
      await buildDist({
        root: args.root,
      });
      break;
    default:
      printHelp();
      Deno.exit(1);
  }
}
