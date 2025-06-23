import { compileDirectory } from "./compiler.ts";

export async function bundleJS(dir: string): Promise<string> {
  const js = await compileDirectory(dir);
  const render = Deno.readTextFileSync(new URL("./render/render.js", import.meta.url));
  const init = `renderInit(window.document, pugPageFunction);\n`
  return js + render + init;
}

// Update buildDist to accept options
export async function buildDist(opts: { root?: string } = {}) {
  const root = opts.root ? opts.root : Deno.cwd();
  const distDir = new URL("./dist", `file://${root}/`);
  await Deno.mkdir(distDir, { recursive: true });
  await Deno.writeTextFile(new URL("index.html", distDir), indexHtml());
  const jsContent = await bundleJS(root);
  await Deno.writeTextFile(new URL("dist.js", distDir), jsContent);
  console.log(`Production build created at ${distDir}`);
}

export function indexHtml() { 
  return Deno.readTextFileSync(new URL("./render/index.html", import.meta.url));
}
