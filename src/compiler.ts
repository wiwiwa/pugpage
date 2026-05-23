import { walk } from "@std/fs/walk";
import { generateCode } from "./compiler/codegen.ts";
import { findLayouts, resolveLayout, resolveExtendsLayout, toUrlPath, isLayoutFile, isComponentFile } from "./compiler/layouts.ts";
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
 *   3. Emit bundle with pug_pages() registry + pug_components() registry + pug_layout_map + pug_layout_chain
 */
export async function compileDirectory(
  dirPath: string,
  opts: { baseDir?: string; renderUrl: string },
): Promise<string> {
  const base = Deno.realPathSync(opts?.baseDir || dirPath);
  const layouts = await findLayouts(dirPath);

  const pageModules: { path: string; code: string; initCode: string }[] = [];
  const componentModules: { path: string; code: string; initCode: string }[] = [];
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
    const { code, initCode, extendsPath } = compileModule(source, absPath, base, pagePaths);

    if (isComponentFile(absPath)) {
      componentModules.push({ path: urlPath, code, initCode });
    } else {
      pageModules.push({ path: urlPath, code, initCode });
    }

    const layoutTarget = resolveFileLayout(absPath, extendsPath, layouts, base);
    if (isLayoutFile(absPath)) {
      layoutChain[urlPath] = layoutTarget;
    } else {
      layoutMap[urlPath] = layoutTarget;
    }
  }

  return bundleModules(pageModules, componentModules, layoutMap, layoutChain, opts.renderUrl);
}

interface ModuleCompileResult {
  code: string;
  initCode: string;
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

function resolveFileLayout(
  absPath: string,
  extendsPath: string | null,
  layouts: Map<string, string>,
  base: string,
): string | null {
  const isComponent = isComponentFile(absPath);
  if (isComponent) return null;
  if (extendsPath === "NONE") return null;
  if (extendsPath) {
    const resolved = resolveExtendsLayout(absPath, extendsPath, base);
    return resolved ? toUrlPath(resolved, base) : null;
  }
  const resolved = resolveLayout(absPath, layouts, base);
  return resolved ? toUrlPath(resolved, base) : null;
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
  const { code, initCode, hasScopedStyles } = generateCode(ast, urlPath);
  const scopeId = hasScopedStyles ? hashString(urlPath) : undefined;

  if (scopeId) {
    return { code: wrapWithScope(code, scopeId), initCode, extendsPath };
  }
  return { code, initCode, extendsPath };
}

function wrapWithScope(code: string, scopeId: string): string {
  const id = JSON.stringify(scopeId);
  const inject = `(function(__r){if(__r&&typeof __r==="object"){if(!__r.data)__r.data={};if(!__r.data.attrs)__r.data.attrs={};__r.data.attrs["data-scope"]=${id}}return __r})`;
  return code.replace("return ", `return ${inject}(`).slice(0, -1) + ");";
}

function generateCases(modules: { path: string; code: string }[]): string {
  return modules.map((mod) => {
    const fnBody = JSON.stringify(`with(data) {\n${mod.code}\n}`);
    return `  ${JSON.stringify(mod.path)}: new Function("data", ${fnBody})`;
  }).join(",\n");
}

function generateInitObj(modules: { path: string; initCode: string }[]): string {
  const initEntries = modules
    .filter(m => m.initCode)
    .map(m => `  ${JSON.stringify(m.path)}: new Function("data", ${JSON.stringify(`with(data){${m.initCode}}`)})`)
    .join(",\n");
  return initEntries ? `{\n${initEntries}\n}` : `{}`;
}

function bundleModules(
  pageModules: { path: string; code: string; initCode: string }[],
  componentModules: { path: string; code: string; initCode: string }[],
  layoutMap: Record<string, string | null>,
  layoutChain: Record<string, string | null>,
  renderUrl: string,
): string {
  const pageCases = generateCases(pageModules);
  const componentCases = generateCases(componentModules);
  const allModules = [...pageModules, ...componentModules];
  const allPaths = allModules.map(m => m.path);
  const allInit = generateInitObj(allModules);
  const componentPaths = componentModules.map(m => m.path);
  const componentInit = generateInitObj(componentModules);

  return `window.__pugpage = {
  layoutMap: ${JSON.stringify(layoutMap)},
  layoutChain: ${JSON.stringify(layoutChain)},
  pageCases: {${pageCases}},
  componentCases: {${componentCases}},
  pageInit: ${allInit},
  componentInit: ${componentInit},
  pagePaths: ${JSON.stringify(allPaths)},
  componentPaths: ${JSON.stringify(componentPaths)}
};
await import("${renderUrl}");
`;
}
