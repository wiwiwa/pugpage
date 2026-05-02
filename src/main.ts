/**
 * PugPage CLI Tool
 * Commands: dev, dist, install, update
 */
import { parseArgs } from "@std/cli";
import { startDevServer } from "./dev.ts";
import { buildDist } from "./dist.ts";
import { installOrUpdate } from "./setup.ts";

function printHelp() {
  console.log(`PugPage CLI
Usage:
  pugpage dev [--root=.] [--port=8000] [--api=http://localhost:8080]
  pugpage dist [--root=.] [--out=$root/dist]

Commands:
  dev      Start development server with live reload
  dist     Build application for production
  install  Install pugpage to ./pugpage
  update   Update pugpage to latest version
`);
}

if (import.meta.main) {
  const args = parseArgs(Deno.args,{
    string: ["root", "out", "api"],
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
      });
      break;
    case "dist":
      await buildDist({
        root: args.root,
        out: args.out || args.root+"/dist",
      });
      break;
    case "install":
    case "update":
      await installOrUpdate(args._[0] as "install" | "update");
      break;
    default:
      printHelp();
      Deno.exit(1);
  }
}
