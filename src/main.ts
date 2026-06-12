/**
 * PugPage CLI Tool
 * Commands: dev, dist, test, install, update
 */
import { parseArgs } from "@std/cli";
import { join } from "@std/path";
import { startDevServer } from "./dev.ts";
import { buildDist } from "./dist.ts";
import { runTests } from "./test.ts";
import { initProject } from "./setup.ts";

function getVersion(): string {
  const dir = import.meta.dirname!;
  return JSON.parse(Deno.readTextFileSync(join(dir, "..", "deno.json"))).version;
}

function printHelp() {
  console.log(`PugPage v${getVersion()}
Usage:
  pugpage dev [--root=.] [--port=8000] [--api=URL] [--static=DIR]
  pugpage dist [--root=.] [--out=DIR]
  pugpage test [--root=.] [--api=URL] [--static=DIR] [-v|--verbose] <test.yaml> 
  pugpage init [dir]

Commands:
  dev      Start development server with live reload
  dist     Build application for production
  test     Run declarative browser tests in headless mode
  init     Scaffold a new PugPage project in the specified directory

Options:
  --root    Project root directory (default: .)
  --port    Dev server port (default: 8000)
  --api     Backend API URL to proxy (default: http://localhost:8080)
  --static  Additional directory to serve static files from
  --out     Output directory for dist build (default: $root/dist)
  -v, --verbose  Show browser console output during tests
  -V, --version  Print version
`);
}

if (import.meta.main) {
  const args = parseArgs(Deno.args,{
    string: ["root", "out", "api", "static", "test"],
    boolean: ["verbose", "v", "version", "V"],
    default: {
      root: ".",
      port: 8000,
      verbose: false,
      v: false,
      version: false,
      V: false,
    },
  });
  if (args.version || args.V) {
    console.log(`PugPage v${getVersion()}`);
    Deno.exit(0);
  }
  switch (args._[0]) {
    case "dev":
      await startDevServer({
        root: args.root,
        port: Number(args.port),
        watch: true,
        proxyTarget: args.api,
        staticDir: args.static,
      });
      break;
    case "dist":
      await buildDist({
        root: args.root,
        out: args.out || args.root+"/dist",
      });
      break;
    case "test": {
      const testGlobs = args._.slice(1).map(String);
      if (testGlobs.length === 0) {
        testGlobs.push("*.test.yaml");
      }
      
      const { expandGlob } = await import("@std/fs");
      const { resolve } = await import("@std/path");
      const searchRoot = resolve(args.root);
      const testFiles: string[] = [];
      for (const pattern of testGlobs) {
        // Use synchronous array building for simplicity
        for await (const file of expandGlob(pattern, { root: searchRoot })) {
          if (file.isFile) testFiles.push(file.path);
        }
      }

      if (testFiles.length === 0) {
        console.error("No test files found matching: " + testGlobs.join(", "));
        Deno.exit(1);
      }

      const passed = await runTests({
        root: args.root,
        testFiles,
        proxyTarget: args.api,
        staticDir: args.static,
        verbose: args.verbose || args.v,
      });
      Deno.exit(passed ? 0 : 1);
    }
    case "init": {
      const targetDir = args._[1] ? String(args._[1]) : ".";
      await initProject(targetDir);
      break;
    }
    default:
      printHelp();
      Deno.exit(1);
  }
}
