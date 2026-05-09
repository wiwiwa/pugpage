import { walk } from "@std/fs/walk";
import { generateCode } from "./compiler/codegen.ts";
import { findLayouts, resolveLayout, resolveExtendsLayout, toUrlPath, isLayoutFile } from "./compiler/layouts.ts";
import { hashString } from "./compiler/css-scope.ts";

import pugLoad from "pug-load";
import pugLink from "pug-linker";
import pugLex from "pug-lexer";
import pugParse from "pug-parser";


/**
 * Compiles all Pug files in a directory into a single JS bundle string.
 *
 * Pipeline:
 *   1. Walk to find layout.pug files, build layout map
 *   2. For each .pug: read → layout transforms → lex → parse → load → link → codegen
 *   3. Emit bundle with pug_pages() registry + pug_layout_map + pug_layout_chain
 */
export async function compileDirectory(
  dirPath: string,
  opts: { baseDir?: string; renderUrl: string },
): Promise<string> {
  const base = Deno.realPathSync(opts?.baseDir || dirPath);
  const layouts = await findLayouts(dirPath);

  const modules: { path: string; code: string }[] = [];
  const layoutMap: Record<string, string | null> = {};
  const layoutChain: Record<string, string | null> = {};

  const pagePaths = new Set<string>();
  for await (const entry of walk(dirPath, { exts: ["pug"] })) {
    if (entry.isDirectory) continue;
    const absPath = Deno.realPathSync(entry.path);
    pagePaths.add(toUrlPath(absPath, base));
  }

  for await (const entry of walk(dirPath, { exts: ["pug"] })) {
    if (entry.isDirectory) continue;

    const absPath = Deno.realPathSync(entry.path);
    const urlPath = toUrlPath(absPath, base);

    const source = await Deno.readTextFile(absPath);
    const { code, extendsPath } = compileModule(source, absPath, base, pagePaths);
    modules.push({ path: urlPath, code });

    const resolvedLayout = extendsPath === "NONE"
      ? null
      : extendsPath
        ? resolveExtendsLayout(absPath, extendsPath, base)
        : resolveLayout(absPath, layouts, base);

    const layoutTarget = resolvedLayout ? toUrlPath(resolvedLayout, base) : null;

    if (isLayoutFile(absPath)) {
      layoutChain[urlPath] = layoutTarget;
    } else {
      layoutMap[urlPath] = layoutTarget;
    }
  }

  return bundleModules(modules, layoutMap, layoutChain, opts.renderUrl);
}

interface ModuleCompileResult {
  code: string;
  extendsPath: string | null;
}

function extractExtendsFromAst(ast: { nodes?: { type: string; file?: { path: string } }[] }): string | null {
  for (const node of ast.nodes ?? []) {
    if (node.type === "Extends" && node.file) {
      return node.file.path;
    }
  }
  return null;
}

function stripExtendsFromAst(ast: { nodes?: { type: string }[] }): void {
  if (ast.nodes) {
    ast.nodes = ast.nodes.filter((n) => n.type !== "Extends");
  }
}

function compileModule(
  source: string,
  absPath: string,
  base: string,
  pagePaths: Set<string>,
): ModuleCompileResult {
  const tokens = pugLex(source, { filename: absPath });
  const parsed = pugParse(tokens, { filename: absPath, src: source });

  const extendsPath = extractExtendsFromAst(parsed);
  stripExtendsFromAst(parsed);

  const loaded = pugLoad(parsed, {
    lex: pugLex,
    parse: pugParse,
    basedir: base,
    filename: absPath,
  });
  const ast = pugLink(loaded);
  const urlPath = absPath.slice(base.length, -4);
  const { code, hasScopedStyles } = generateCode(ast, urlPath);
  const scopeId = hasScopedStyles ? hashString(urlPath) : undefined;

  if (scopeId) {
    return { code: wrapWithScope(code, scopeId), extendsPath };
  }
  return { code, extendsPath };
}

function wrapWithScope(code: string, scopeId: string): string {
  const id = JSON.stringify(scopeId);
  const inject = `(function(__r){if(__r&&typeof __r==="object"){if(!__r.data)__r.data={};if(!__r.data.attrs)__r.data.attrs={};__r.data.attrs["data-scope"]=${id}}return __r})`;
  return code.replace("return ", `return ${inject}(`).slice(0, -1) + ");";
}

function bundleModules(
  modules: { path: string; code: string }[],
  layoutMap: Record<string, string | null>,
  layoutChain: Record<string, string | null>,
  renderUrl: string,
): string {
  const cases = modules.map((mod) => {
    const fnBody = JSON.stringify(`with(data) {\n${mod.code}\n}`);
    return `    case '${mod.path}': {
      var __fn = new Function("data", "__s", "__v", ${fnBody});
      return function(data) { return __fn(data, __s, __v); };
    }`;
  }).join("\n");

  return `const pug_layout_map = ${JSON.stringify(layoutMap)};
const pug_layout_chain = ${JSON.stringify(layoutChain)};

function __s(v) { return v == null ? '' : String(v); }
function __v(fn) { try { return fn(); } catch(e) { if (e instanceof ReferenceError) console.warn('PugPage:', e.message); return ''; } }

function pug_pages(filePath) {
  if (pug_pages.__cache[filePath]) return pug_pages.__cache[filePath];
  var result = (function() {
  switch (filePath) {
${cases}
    default: return null;
  }
  })();
  if (result) pug_pages.__cache[filePath] = result;
  return result;
}
pug_pages.__cache = {};
pug_pages.__paths = ${JSON.stringify(modules.map(m => m.path))};
Object.assign(window, { pug_pages, __s, __v, pug_layout_map, pug_layout_chain });
await import("${renderUrl}");
`;
}
