import { walk } from "@std/fs/walk";
import { generateCode } from "./compiler/codegen.ts";
import { findLayouts, resolveLayout, resolveExtendsLayout, toUrlPath, isLayoutFile } from "./compiler/layouts.ts";
import { scopeCss } from "./compiler/css-scope.ts";

import pugLoad from "npm:pug-load";
import pugLink from "npm:pug-linker";
import pugLex from "npm:pug-lexer";
import pugParse from "npm:pug-parser";


/**
 * Compiles all Pug files in a directory into a single JS bundle string.
 *
 * Pipeline:
 *   1. Walk to find layout.pug files, build layout map
 *   2. For each .pug: read → layout transforms → lex → parse → load → link → codegen
 *   3. CSS scoping for pages with <style> elements
 *   4. Emit bundle with pug_pages() registry + pug_layout_map + pug_layout_chain
 */
export async function compileDirectory(
  dirPath: string,
  opts?: { baseDir?: string; renderUrl?: string },
): Promise<string> {
  const base = Deno.realPathSync(opts?.baseDir || dirPath);
  const renderUrl = opts?.renderUrl || "./render.js";
  const layouts = await findLayouts(dirPath);

  const modules: { path: string; code: string }[] = [];
  const layoutMap: Record<string, string | null> = {};
  const layoutChain: Record<string, string | null> = {};
  const scopeStyles: { scopeId: string; css: string }[] = [];

  for await (const entry of walk(dirPath, { exts: ["pug"] })) {
    if (entry.isDirectory) continue;

    const absPath = Deno.realPathSync(entry.path);
    const urlPath = toUrlPath(absPath, base);

    const source = await Deno.readTextFile(absPath);
    const { code, scopeId, scopedCss, extendsPath } = compileModule(source, absPath, base);
    modules.push({ path: urlPath, code });

    if (scopedCss) {
      scopeStyles.push({ scopeId, css: scopedCss });
    }

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

  return bundleModules(modules, layoutMap, layoutChain, scopeStyles, renderUrl);
}

interface ModuleCompileResult {
  code: string;
  scopeId: string;
  scopedCss: string;
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
  const { code, styles } = generateCode(ast);

  let scopeId = "";
  let scopedCss = "";
  if (styles.length > 0) {
    const css = styles.join("\n");
    const scoped = scopeCss(css, urlPath);
    scopeId = scoped.scopeId;
    scopedCss = scoped.css;
  }

  return { code, scopeId, scopedCss, extendsPath };
}

function bundleModules(
  modules: { path: string; code: string }[],
  layoutMap: Record<string, string | null>,
  layoutChain: Record<string, string | null>,
  scopeStyles: { scopeId: string; css: string }[],
  renderUrl: string,
): string {
  const scopedCss = scopeStyles
    .filter((s) => s.css && s.css !== s.scopeId)
    .map((s) => `(function(){ var s=document.createElement("style"); s.textContent=${JSON.stringify(s.css)}; document.head.appendChild(s); })();`)
    .join("\n");

  const cases = modules.map((mod) => {
    const fnBody = JSON.stringify(`with(data) {\n${mod.code}\n}`);
    return `    case '${mod.path}': {
      var __fn = new Function("data", "__s", "__v", ${fnBody});
      var render = function(data) { return __fn(data, __s, __v); };
      return render;
    }`;
  }).join("\n");

  return `const pug_layout_map = ${JSON.stringify(layoutMap)};
const pug_layout_chain = ${JSON.stringify(layoutChain)};

${scopedCss}

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
Object.assign(window, { pug_pages, __s, __v, pug_layout_map, pug_layout_chain });
await import("${renderUrl}");
`;
}
