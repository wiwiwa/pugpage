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
  await Deno.writeTextFile(`${opts.out}/index.html`, indexHtml());
  const jsContent = await bundleJS(opts.root);
  const minified = await minify(jsContent);
  await Deno.writeTextFile(`${opts.out}/dist.js`, minified.code||jsContent);
  console.log(`Production JS bundle written to ${opts.out}`);
}

export function indexHtml() { return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PugPage Dev Server</title>
  <script type="module" src="/dist.js"></script>
  <script>
    const es = new EventSource('/__livereload');
    es.onmessage = e => e.data==='reload' && location.reload();
  </script>
</head>
<body />
</html>`;
}