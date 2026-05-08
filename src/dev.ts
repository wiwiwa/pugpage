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

  if (opts.watch) await ensureIndexHtml(root);

  const server = Deno.serve({ port: opts.port }, async (req: Request) => {
    const url = new URL(req.url);

    if (req.headers.get("upgrade")?.toLowerCase() === "websocket")
      return proxyWebSocket(req, proxyTarget);

    switch (url.pathname) {
      case "/":
        return await indexResponse(root);
      case "/pugpage-dist.js": {
        const js = await compileDirectory(root, { renderUrl: "/$$dev/render.js" });
        return new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      case "/$$dev/render.js": {
        const js = await readRenderJs();
        return new Response(js, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      case "/$$dev/__livereload":
        return livereloadSSE();
      case "/$$dev/api/login":
        if (req.method === "POST") return handleDemoLoginPost(req);
        return handleDemoLoginGet(req);
      case "/$$dev/api/user/1000":
        if (req.method === "GET") return handleDemoUserGet(req);
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const resp = await serveDir(req, { fsRoot: root, quiet: true });
    if (resp.status !== 404 && resp.status !== 405) return resp;
    if (opts.staticDir) {
      const staticResp = await serveDir(req, { fsRoot: opts.staticDir });
      if (staticResp.status !== 404 && staticResp.status !== 405) return staticResp;
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

function toWebSocketTarget(reqUrl: URL, target: string): URL {
  const proxyUrl = new URL(reqUrl.pathname + reqUrl.search, target);
  proxyUrl.protocol = proxyUrl.protocol === "https:" ? "wss:" : "ws:";
  return proxyUrl;
}

function closeSocket(socket: WebSocket, code?: number, reason?: string) {
  if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) return;
  if (code === 1000 || (code !== undefined && code >= 3000 && code <= 4999)) {
    socket.close(code, reason);
    return;
  }
  socket.close();
}

function proxyWebSocket(req: Request, target: string): Response {
  const backendUrl = toWebSocketTarget(new URL(req.url), target);
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);
  const backendWs = new WebSocket(backendUrl);
  const pendingMessages: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  let backendOpen = false;

  clientWs.addEventListener("message", (event) => {
    if (!backendOpen) {
      pendingMessages.push(event.data);
      return;
    }
    backendWs.send(event.data);
  });

  backendWs.addEventListener("open", () => {
    backendOpen = true;
    for (const message of pendingMessages) {
      backendWs.send(message);
    }
    pendingMessages.length = 0;
  });

  backendWs.addEventListener("message", (event) => {
    clientWs.send(event.data);
  });

  backendWs.addEventListener("close", (event) => {
    closeSocket(clientWs, event.code, event.reason);
  });
  clientWs.addEventListener("close", (event) => {
    closeSocket(backendWs, event.code, event.reason);
  });

  backendWs.addEventListener("error", () => {
    closeSocket(clientWs, 1011, "WebSocket proxy backend error");
  });
  clientWs.addEventListener("error", () => {
    closeSocket(backendWs, 1011, "WebSocket proxy client error");
  });

  return response;
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
  const injected = html.replace("</head>", () =>
    `<script>new EventSource('/$$dev/__livereload').addEventListener('message',function(e){if(e.data==='reload')location.reload()})</script></head>`);
  return new Response(injected, {
    headers: { "Content-Type": "text/html" },
  });
}

function handleDemoLoginGet(req: Request): Response {
  const auth = req.headers.get("authorization");
  if (auth === "Bearer demo-token") {
    return Response.json({ name: "demo", roles: ["user"] });
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function handleDemoUserGet(req: Request): Response {
  const auth = req.headers.get("authorization");
  if (auth === "Bearer demo-token") {
    return Response.json({ id: 1000, name: "demo", roles: ["user"] });
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function handleDemoLoginPost(req: Request): Promise<Response> {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.username === "demo" && body.password === "demo") {
    return Response.json({ name: "demo", roles: ["user"], token: "demo-token" });
  }
  return Response.json({ error: "Invalid credentials" }, { status: 401 });
}
