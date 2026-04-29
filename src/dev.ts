import { serveDir } from "@std/http/file-server";
import { compileDirectory } from "./compiler.ts";
import { indexHtml, readRenderJs } from "./dist.ts";

let livereloadClients: Array<(msg: string) => void> = [];
export async function startDevServer(opts: { root: string; port: number; watch?: boolean }) {
  console.log(`Starting development server in ${opts.root} on port ${opts.port} ...`);
  const root = opts.root;

  const server = Deno.serve({ port: opts.port }, async (req: Request) => {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/":
        return indexResponse();
      case "/dist.js": {
        const js = await compileDirectory(root);
        return new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      case "/render.js":
        return new Response(readRenderJs(), {
          headers: { "Content-Type": "application/javascript" },
        });
      case "/__livereload":
        return livereloadSSE();
    }
    const resp = await serveDir(req, { fsRoot: root });
    if (resp.status === 404 && req.headers.get("accept")?.includes("text/html")) {
      return indexResponse();
    }
    return resp;
  });

  opts.watch && watchAndReload(opts.root);
  return server;
}

function livereloadSSE(): Response {
  let send: (msg: string) => void;
  const stream = new ReadableStream({
    start(controller) {
      send = (msg: string) => {
        try{ controller.enqueue(`data: ${msg}\n\n`);}
        catch(_e){/* ignore */}
      };
      livereloadClients.push(send);
    },
    cancel() {
      livereloadClients = livereloadClients.filter((s) => s !== send);
    }
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
  );
}

async function watchAndReload(dir: string) {
  const watcher = Deno.watchFs(dir);
  for await (const event of watcher) {
    const isPug = event.paths.some((p) => p.endsWith(".pug"));
    if (!isPug) continue;
    switch (event.kind) {
      case "modify":
      case "create":
      case "remove":
        console.log(`Pug change detected: ${event.paths.join(", ")}`);
        for (const send of livereloadClients) send("reload");
    }
  }
}

function indexResponse() {
  return new Response(indexHtml("/dist.js"), {
    headers: { "Content-Type": "text/html" },
  });
}
