/**
 * PugPage CLI Tool
 * Commands: dev, dist, test, install, update
 */
import { parseArgs } from "@std/cli";
import { startDevServer } from "./dev.ts";
import { buildDist } from "./dist.ts";
import { runTests } from "./test.ts";
import { installOrUpdate } from "./setup.ts";

function printHelp() {
  console.log(`PugPage CLI
Usage:
  pugpage dev [--root=.] [--port=8000] [--api=URL] [--static=DIR]
  pugpage dist [--root=.] [--out=DIR]
  pugpage test [--root=.] [--api=URL] [--static=DIR] <test.yaml> 

Commands:
  dev      Start development server with live reload
  dist     Build application for production
  test     Run declarative browser tests in headless mode
  install  Install pugpage to ./pugpage
  update   Update pugpage to latest version

Options:
  --root    Project root directory (default: .)
  --port    Dev server port (default: 8000)
  --api     Backend API URL to proxy (default: http://localhost:8080)
  --static  Additional directory to serve static files from
  --out     Output directory for dist build (default: $root/dist)
`);
}

if (import.meta.main) {
  const args = parseArgs(Deno.args,{
    string: ["root", "out", "api", "static", "test"],
    default: {
      root: ".",
      port: 8000,
    },
  });
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
      const testFile = args._[1];
      if (!testFile) {
        console.error("Usage: pugpage test <test.yaml>");
        Deno.exit(1);
      }
      const passed = await runTests({
        root: args.root,
        testFile: String(testFile),
        proxyTarget: args.api,
        staticDir: args.static,
      });
      Deno.exit(passed ? 0 : 1);
    }
    case "install":
    case "update":
      await installOrUpdate(args._[0] as "install" | "update");
      break;
    default:
      printHelp();
      Deno.exit(1);
  }
}
