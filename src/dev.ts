/**
 * Development server for PugPage
 * - Serves compiled Pug files and static assets
 * - Watches for file changes and triggers live reload
 * - Handles 404 to serve /index.html
 */

import { serveDir } from "jsr:@std/http/file-server";
import { bundleJS } from "./dist.ts";

let livereloadClients: Array<(msg: string) => void> = [];
let bundleJSStr = "";

export async function startDevServer() {
  const fsRoot = Deno.cwd();
  console.log(`Starting development server in ${fsRoot} ...`);
  bundleJSStr = await bundleJS(fsRoot);

  Deno.serve(async (req) => {
    switch(new URL(req.url).pathname){
      case '/bundle.js':
        return new Response(bundleJSStr, {headers: {'Content-Type': 'application/javascript'}});
      case '/__livereload':
        return livereloadSSE();
    }
    const resp = serveDir(req, {fsRoot});
    if((await resp).status===404 && req.headers.get('accept')?.includes('text/html') )
      return indexResponse();
    return resp;
  }, { port: 8080 });

  watchAndReload(fsRoot);
}

function livereloadSSE(): Response {
  let send: (msg: string) => void;
  const stream = new ReadableStream({
    start(controller) {
      send = (msg: string) => {
        try{ controller.enqueue(`data: ${msg}\n\n`);}
        catch(e){}
      };
      livereloadClients.push(send);
    },
    cancel() {
      livereloadClients = livereloadClients.filter((s) => s!==send);
    }
  });
  return new Response(stream.pipeThrough(new TextEncoderStream()),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
  );
}

async function watchAndReload(dir: string) {
  const watcher = Deno.watchFs(dir);
  for await (const event of watcher)
    switch (event.kind){
      case 'modify':
      case 'create':
      case 'remove':
        console.log(`File change detected: ${event.paths.join(', ')}`);
        bundleJSStr = await bundleJS(dir);
        for (const send of livereloadClients)
          send('reload');
    }
}

const DEFAULT_INDEX = `<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\">
  <title>PugPage Dev Server</title>
  <script type="module" src="/bundle.js"></script>
  <script>
    const es = new EventSource('/__livereload');
    es.onmessage = e => e.data==='reload' && location.reload();
  </script>
</head>
<body />
</html>`;
function indexResponse(){
  return new Response(DEFAULT_INDEX, {
    status: 404,
    headers: { 'Content-Type': 'text/html' }
  })
};
