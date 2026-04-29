import {minify} from "terser";
import { compileDirectory } from "./compiler.ts";

export function readRenderJs(): string {
  return Deno.readTextFileSync(new URL("./render/render.js", import.meta.url));
}

export async function buildDist(opts: { root: string, out: string }) {
  await Deno.mkdir(opts.out, { recursive: true });
  let jsContent = await compileDirectory(opts.root, {
    renderUrl: "https://cdn.jsdelivr.net/gh/wiwiwa/pugpage@master/dist/render.min.js",
  });
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
  <script type="module" src="${jsFile}"></script>
  ${liveReload}
</head>
<body>
  <pug-page src="/index" />
</html>`;
}