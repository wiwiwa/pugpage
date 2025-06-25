/**
 * Development server for PugPage
 * - Serves compiled Pug files and static assets
 * - Watches for file changes and triggers live reload
 * - Handles 404 to serve /index.html
 */

import { serveDir } from "jsr:@std/http/file-server";
import { bundleJS, indexHtml } from "./dist.ts";

let livereloadClients: Array<(msg: string) => void> = [];
let bundleJSStr = "";

/**
 * Starts the development server.
 * @param opts - Options for the development server.
 * @param opts.root - The root directory to serve. Defaults to the current working directory.
 * @param opts.port - The port to listen on. Defaults to 8000.
 */
export async function startDevServer(opts: { root:string; port:number }) {
  console.log(`Starting development server in ${opts.root} on port ${opts.port} ...`);
  bundleJSStr = await bundleJS(opts.root);

  // Fix Deno.serve usage and lint issues
  Deno.serve({ port: opts.port }, async (req: Request) => {
    switch(new URL(req.url).pathname){
      case '/dist.js':
        return new Response(bundleJSStr, {headers: {'Content-Type': 'application/javascript'}});
      case '/__livereload':
        return livereloadSSE();
    }
    const resp = serveDir(req, {fsRoot: opts.root});
    if((await resp).status===404 && req.headers.get('accept')?.includes('text/html') )
      return indexResponse();
    return resp;
  });

  watchAndReload(opts.root);
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

function indexResponse(){
  return new Response(indexHtml('/dist.js'), {
    status: 404,
    headers: { 'Content-Type': 'text/html' }
  })
};
