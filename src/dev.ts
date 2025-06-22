/**
 * Development server for PugPage
 * - Serves compiled Pug files and static assets
 * - Watches for file changes and triggers live reload
 * - Handles 404 to serve /index.html
 */

import { serveDir } from "jsr:@std/http/file-server";

let livereloadClients: Array<(msg: string) => void> = [];

export function startDevServer() {
  const fsRoot = Deno.cwd();
  console.log(`Starting development server in ${fsRoot} ...`);

  Deno.serve(async (req) => {
    const url = new URL(req.url);
    if (url.pathname === '/__livereload')
      return livereloadSSE();

    const resp = serveDir(req, {fsRoot});
    if((await resp).status===404)
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
        for (const send of livereloadClients)
          send('reload');
    }
}

const DEFAULT_INDEX = `<!DOCTYPE html>
<html lang=\"en\">
<head>
  <meta charset=\"UTF-8\">
  <title>PugPage Dev Server</title>
  <script language="javascript" src="/bundle.js"></script>
  <script>
    const es = new EventSource('/__livereload');
    es.onmessage = e => e.data==='reload' && location.reload();
  </script>
</head>
<body>
  <h1>Welcome to PugPage Dev Server</h1>
  <p>Edit your files and see changes instantly!</p>
  <div>
  </div>
</body>
</html>`;
function indexResponse(){
  return new Response(DEFAULT_INDEX, {
    status: 404,
    headers: { 'Content-Type': 'text/html' }
  })
};
