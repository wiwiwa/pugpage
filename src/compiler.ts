import { walk } from "jsr:@std/fs/walk";
import { compileClient } from 'npm:pug';

async function compileFile(filePath: string): Promise<string> {
  const pugContent = await Deno.readTextFile(filePath);
  return compileClient(pugContent, {
    compileDebug: false,
  });
}

/** Compiles all Pug files in a directory into a single JavaScript string */
export async function compileDirectory(dirPath: string): Promise<string> {
  let js = "";
  const basePathLen = Deno.realPathSync(dirPath).length;
  for await (const entry of walk(dirPath, {exts:["pug"]})) {
    if (!entry.isFile) continue;
    const path = Deno.realPathSync(entry.path);
    const urlPath = path.slice(basePathLen, path.length-4);
    const funcString = await compileFile(path);
    js += `case '${urlPath}': { ${funcString}; return template; }\n`;
  }
  return renderJS(js);
}

function renderJS(templates:string) { return `
function pugPageFunction(filePath) {
  switch (filePath) {
    ${templates}
    default: return null;
  }
}
`};
