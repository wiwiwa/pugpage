import { compileDirectory } from "./compiler.ts";

export async function bundleJS(dir: string): Promise<string> {
  const js = await compileDirectory(dir);
  const render = Deno.readTextFileSync(new URL("./render.js", import.meta.url));
  const init = `renderInit(window.document, pugPageFunction);\n`
  return js + render + init;
}
