import { exists } from "@std/fs/exists";
import { minify } from "terser";
import { compileDirectory } from "./compiler.ts";

const RENDER_CDN = new URL("../release/render.min.js", import.meta.url).href;

export async function ensureIndexHtml(root: string): Promise<void> {
  const indexPath = root + "/index.html";
  if (!(await exists(indexPath))) {
    await Deno.writeTextFile(indexPath, defaultIndexHtml());
    console.log(`Created index.html in ${root}`);
  }
}

export function defaultIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script type="module" src="/pugpage-dist.js"></script>
</head>
<body>
  <pug-page src="/index" />
</html>`;
}

export async function buildDist(opts: { root: string; out: string }) {
  await Deno.mkdir(opts.out, { recursive: true });
  let jsContent = await compileDirectory(opts.root, { renderUrl: RENDER_CDN });
  const importLine = `await import("${RENDER_CDN}");`;
  const idx = jsContent.lastIndexOf(importLine);
  const bundleOnly = jsContent.slice(0, idx);
  const minified = await minify(bundleOnly);
  jsContent = (minified.code || bundleOnly) + `\n${importLine}\n`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jsContent));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
  const jsFile = `dist.${hashHex}.js`;
  await Deno.writeTextFile(`${opts.out}/${jsFile}`, jsContent);

  const indexPath = `${opts.root}/index.html`;
  if (!(await exists(indexPath))) {
    console.error(`Error: ${indexPath} not found. Run "pugpage dev" first to generate it.`);
    Deno.exit(1);
  }
  const template = await Deno.readTextFile(indexPath);
  const html = template
    .replace(`src="/pugpage-dist.js"`, `src="${jsFile}"`);
  await Deno.writeTextFile(`${opts.out}/index.html`, html);
  console.log(`Production build written to ${opts.out}`);
}
