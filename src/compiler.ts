import { walk } from "jsr:@std/fs/walk";
import { compileClient } from 'npm:pug';

export async function compileFile(filePath: string): Promise<string> {
  const pugContent = await Deno.readTextFile(filePath);
  return compileClient(pugContent, {
    compileDebug: false,
  });
}

/** Compiles all Pug files in a directory into a single JavaScript string */
export async function compileDirectory(dirPath: string): Promise<string> {
  let js = "";
  const basePathLen = dirPath.length;
  for await (const entry of walk(dirPath, {exts:["pug"]})) {
    if (!entry.isFile) continue;
    const urlPath = entry.path.slice(basePathLen, entry.path.length-4);
    const funcString = await compileFile(entry.path);
    js += `case '${urlPath}': { ${funcString}; return template; }\n`;
  }
  return renderJS(js);
}

function renderJS(templates:string) { return `
return (filePath) => {
  switch (filePath) {
    ${templates}
    default: return null;
  }
}
`};
