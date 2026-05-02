import { serveDir } from "@std/http/file-server";
import { compileDirectory } from "./compiler.ts";
import { ensureIndexHtml } from "./dist.ts";

let livereloadClients: Array<(msg: string) => void> = [];

async function readRenderJs(): Promise<string> {
  const url = new URL("./render/render.js", import.meta.url);
  if (url.protocol === "file:") {
    return Deno.readTextFileSync(url);
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch render.js: ${resp.status}`);
  return resp.text();
}

export async function startDevServer(opts: {
  root: string;
  port: number;
  watch?: boolean;
  proxyTarget?: string;
  staticDir?: string;
}) {
  const proxyTarget = opts.proxyTarget ?? "http://localhost:8080";
  console.log(`Starting development server in ${opts.root} on port ${opts.port} ...`);
  console.log(`API proxy → ${proxyTarget}`);
  if (opts.staticDir) {
    console.log(`Static dir → ${opts.staticDir}`);
  }
  const root = opts.root;

  await ensureIndexHtml(root);

  const server = Deno.serve({ port: opts.port }, async (req: Request) => {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/":
        return await indexResponse(root);
      case "/dist.js": {
        const js = await compileDirectory(root, { renderUrl: "/render.js" });
        return new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      case "/render.js": {
        const js = await readRenderJs();
        return new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      case "/__livereload":
        return livereloadSSE();
    }
    const resp = await serveDir(req, { fsRoot: root });
    if (resp.status !== 404) return resp;
    if (opts.staticDir) {
      const staticResp = await serveDir(req, { fsRoot: opts.staticDir });
      if (staticResp.status !== 404) return staticResp;
    }
    if (req.headers.get("accept")?.includes("text/html")) return await indexResponse(root);
    if (isJsonRequest(req)) return proxyRequest(req, proxyTarget);
    return resp;
  });

  if (opts.watch) {
    watchAndReload(opts.root);
    if (opts.staticDir) watchAndReload(opts.staticDir);
  }
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
    switch (event.kind) {
      case "modify":
      case "create":
      case "remove":
        console.log(`Change detected: ${event.paths.join(", ")}`);
        for (const send of livereloadClients) send("reload");
    }
  }
}

function isJsonRequest(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json")) return true;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return true;
  return false;
}

async function proxyRequest(req: Request, target: string): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = new URL(url.pathname + url.search, target);
  const headers = new Headers(req.headers);
  headers.set("Host", targetUrl.host);
  headers.delete("accept-encoding");

  try {
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
    });
    const respHeaders = new Headers(resp.headers);
    respHeaders.delete("transfer-encoding");
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Proxy error", message: (e as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function indexResponse(root: string) {
  const html = await Deno.readTextFile(`${root}/index.html`);
  const injected = html.replace("</head>",
    `<script>new EventSource('/__livereload').addEventListener('message',function(e){if(e.data==='reload')location.reload()})</script></head>`);
  return new Response(injected, {
    headers: { "Content-Type": "text/html" },
  });
}
