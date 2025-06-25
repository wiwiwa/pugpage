import {minify} from "https://esm.sh/terser@5.27.0";
import { compileDirectory } from "./compiler.ts";

export async function bundleJS(dir: string): Promise<string> {
  const js = await compileDirectory(dir);
  const render = Deno.readTextFileSync(new URL("./render/render.js", import.meta.url));
  const init = `renderInit(window.document, pugPageFunction);\n`
  return js + render + init;
}

export async function buildDist(opts: { root: string, out: string }) {
  await Deno.mkdir(opts.out, { recursive: true });
  let jsContent = await bundleJS(opts.root);
  const minified = await minify(jsContent);
  jsContent = minified.code||jsContent;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jsContent));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
  const jsFile = `dist.${hashHex}.js`;
  await Deno.writeTextFile(opts.out+"/"+jsFile, jsContent);
  await Deno.writeTextFile(`${opts.out}/index.html`, indexHtml(jsFile,true));
  console.log(`Production JS bundle written to ${opts.out}`);
}

export function indexHtml(jsFile:string, isProduction=false): string {
  const liveReload = isProduction ? `` : `
  <script>
    const es = new EventSource('/__livereload');
    es.onmessage = e => e.data==='reload' && location.reload();
  </script>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PugPage Dev Server</title>
  <script type="module" src="${jsFile}"></script>
  ${liveReload}
</head>
<body />
</html>`;
}