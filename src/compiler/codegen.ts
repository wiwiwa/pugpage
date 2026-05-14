/**
 * Pug AST → snabbdom h() code generator.
 * Handles: Block, Tag, InterpolatedTag, Text, Code, Doctype,
 *          Comment, BlockComment, Literal, Conditional, Each, EachOf,
 *          Case, While, Mixin, MixinBlock, YieldBlock.
 */

import type { PugASTNode } from "./types.ts";
import { scopeCss, hashString } from "./css-scope.ts";
import * as sass from "sass";

let __urlPath = "";
let __styleIndex = 0;
let __hasScopedStyles = false;

export function generateCode(ast: PugASTNode, urlPath: string): { code: string; hasScopedStyles: boolean } {
  __urlPath = urlPath;
  __styleIndex = 0;
  __hasScopedStyles = false;
  const { exprs, stmts } = generateBlock(ast);

  const preamble = stmts.length > 0 ? stmts.join(";\n") + ";\n" : "";

  let returnExpr: string;
  if (exprs.length === 0) {
    returnExpr = 'return h("div");';
  } else if (exprs.length === 1) {
    returnExpr = `return ${exprs[0]};`;
  } else {
    returnExpr = `return h("div", [\n  ${exprs.join(",\n")}\n]);`;
  }

  const code = preamble + returnExpr;
  return { code, hasScopedStyles: __hasScopedStyles };
}
interface BlockResult {
  exprs: string[];
  stmts: string[];
}

function blockToExpr(result: BlockResult): string {
  if (result.exprs.length === 0 && result.stmts.length === 0) {
    return "null";
  }
  if (result.stmts.length === 0) {
    if (result.exprs.length === 1) return result.exprs[0];
    return `[${result.exprs.join(", ")}]`;
  }
  const innerStmts = result.stmts.join("; ") + ";";
  const innerRet = result.exprs.length === 1
    ? `return ${result.exprs[0]};`
    : `return [${result.exprs.join(", ")}];`;
  return `(function() { ${innerStmts} ${innerRet} })()`;
}

function isBlockEmpty(block: PugASTNode | undefined): boolean {
  return !block || !block.nodes || block.nodes.length === 0;
}

function extractTextBlock(node: PugASTNode): string {
  if (!node.block?.nodes) return "";
  return node.block.nodes
    .filter((n) => n.type === "Text")
    .map((n) => n.val ?? "")
    .join("");
}

function isScopedStyle(node: PugASTNode): boolean {
  const scopedAttr = node.attrs?.find((attr) => attr.name === "scoped");
  if (!scopedAttr) return true;
  return scopedAttr.val !== "false";
}

function isCustomTag(tagName: string): boolean {
  return tagName.includes("-") && tagName !== "pug-page";
}

function emitCustomTagData(node: PugASTNode, dataParts: string[], blockResult: BlockResult): void {
  const compAttrs = (node.attrs ?? [])
    .filter(a => a.name !== "$role" && a.name !== "$lang" && a.name !== "class" && a.name !== "id")
    .map(a => a.name + ": " + a.val);
  if (compAttrs.length > 0) {
    dataParts.push("__attrs: {" + compAttrs.join(", ") + "}");
  }
  if (blockResult.exprs.length > 0 || blockResult.stmts.length > 0) {
    const childrenExpr = blockToExpr(blockResult);
    dataParts.push("__content: " + childrenExpr);
  }
  const syncProps = "vn.elm.__pugpage_attrs=vn.data.__attrs;vn.elm.__pugpage_content=vn.data.__content";
  dataParts.push(`hook:{create:(_,vn)=>{${syncProps}},update:(_,vn)=>{${syncProps};if(vn.elm._update)vn.elm._update()}}`);
}

function compileStyleFilter(node: PugASTNode): string {
  const source = extractTextBlock(node);
  if (!source.trim()) return "";
  const syntax = node.name === "sass" ? "indented" : "scss";
  try {
    return sass.compileString(source, {
      syntax,
      url: node.filename ? new URL(`file://${node.filename}`) : undefined,
    }).css;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const filename = node.filename ? ` in ${node.filename}` : "";
    throw new Error(`Failed to compile :${node.name}${filename}: ${message}`);
  }
}

function makeStyleExpr(css: string, scoped: boolean): string {
  const idx = __styleIndex++;
  if (scoped) __hasScopedStyles = true;
  const input = scoped ? scopeCss(css, __urlPath).css : css;
  const styleId = hashString(__urlPath + ":" + idx + ":" + (scoped ? "s" : "g") + ":" + input);
  return `h("style", { key: "${styleId}", attrs: { "data-pugpage-style": "${styleId}" } }, ${JSON.stringify(input)})`;
}

function generateBlock(node: PugASTNode): BlockResult {
  const exprs: string[] = [];
  const stmts: string[] = [];
  let inlineParts: string[] = [];

  const flushInline = () => {
    if (inlineParts.length > 0) {
      exprs.push(inlineParts.join(" + "));
      inlineParts = [];
    }
  };

  for (const child of node.nodes ?? []) {
    switch (child.type) {
      case "Text": {
        inlineParts.push(JSON.stringify(child.val!));
        break;
      }
      case "Code": {
        if (child.buffer) {
          if (child.mustEscape) {
            inlineParts.push(`__s(__v(function(){ return ${child.val!} }))`);
          } else {
            flushInline();
            exprs.push(rawHtmlSpan(child.val!));
          }
        } else {
          flushInline();
          stmts.push(child.val!);
        }
        break;
      }
      case "Tag": {
        flushInline();
        if (child.name === "style") {
          const css = extractTextBlock(child);
          if (css) exprs.push(makeStyleExpr(css, isScopedStyle(child)));
        } else if (child.name === "slot" && !(child.attrs?.length) && isBlockEmpty(child.block)) {
          exprs.push("__content");
        } else {
          exprs.push(generateTag(child));
        }
        break;
      }
      case "InterpolatedTag": {
        flushInline();
        exprs.push(generateInterpolatedTag(child));
        break;
      }
      case "Conditional": {
        flushInline();
        exprs.push(generateConditional(child));
        break;
      }
      case "Each": {
        flushInline();
        exprs.push(generateEach(child));
        break;
      }
      case "EachOf": {
        flushInline();
        exprs.push(generateEachOf(child));
        break;
      }
      case "Case": {
        flushInline();
        exprs.push(generateCase(child));
        break;
      }
      case "While": {
        flushInline();
        exprs.push(generateWhile(child));
        break;
      }
      case "Mixin": {
        flushInline();
        if (child.call) {
          exprs.push(generateMixinCall(child));
        } else {
          stmts.push(generateMixinDef(child));
        }
        break;
      }
      case "MixinBlock": {
        flushInline();
        if (child.block && child.block.nodes && child.block.nodes.length > 0) {
          const defaultBlock = generateBlock(child.block);
          exprs.push(`(__block_content || ${blockToExpr(defaultBlock)})`);
        } else {
          exprs.push("__block_content");
        }
        break;
      }
      case "Comment":
      case "BlockComment": {
        flushInline();
        break;
      }
      case "Doctype": {
        flushInline();
        break;
      }
      case "Filter": {
        flushInline();
        if (child.name === "scss" || child.name === "sass") {
          const css = compileStyleFilter(child);
          if (css) exprs.push(makeStyleExpr(css, isScopedStyle(child)));
        }
        break;
      }
      case "Literal": {
        flushInline();
        exprs.push(generateLiteral(child));
        break;
      }
      case "NamedBlock": {
        flushInline();
        const sub = generateBlock(child);
        exprs.push(...sub.exprs);
        stmts.push(...sub.stmts);
        break;
      }
      case "YieldBlock": {
        flushInline();
        exprs.push("__content");
        break;
      }
      default: {
        flushInline();
        break;
      }
    }
  }

  flushInline();
  return { exprs, stmts };
}

function generateTag(node: PugASTNode): string {
  let selector = node.name!;
  const attrEntries: string[] = [];
  const dynamicClassEntries: string[] = [];
  const eventEntries: string[] = [];
  let roleCond = "";
  let langCond = "";

  for (const attr of node.attrs ?? []) {
    const a = attr as { name: string; val: string; mustEscape: boolean };

    if (a.name === "$role") {
      roleCond = buildRoleCondition(a.val);
    } else if (a.name === "$lang") {
      langCond = buildLangCondition(a.val);
    } else if (a.name === "class") {
      if (isStaticString(a.val)) {
        for (const cls of extractString(a.val).split(/\s+/)) {
          if (cls) selector += "." + cls;
        }
      } else if (a.val.startsWith("{")) {
        dynamicClassEntries.push(`...${a.val}`);
      } else {
        dynamicClassEntries.push(`[${a.val}]: true`);
      }
    } else if (a.name === "id") {
      if (isStaticString(a.val)) {
        selector += "#" + extractString(a.val);
      } else {
        attrEntries.push(`id: ${a.val}`);
      }
    } else if (a.name.length > 2 && a.name.startsWith("on")) {
      const evtName = a.name.charAt(2).toLowerCase() + a.name.slice(3);
      const handlerCode = isStaticString(a.val) ? extractString(a.val) : a.val;
      eventEntries.push(`${evtName}: function($event){var __elm=this.elm||this;var __s=window.__findScopeProxy(__elm);try{if(__s){with(window.__handlerScope(__s)){${handlerCode}}}else{${handlerCode}}}catch(e){console.error("PugPage event handler error:",e)}window.__rerenderOnEvent(__elm)}`);
    } else {
      if (isStaticString(a.val)) {
        attrEntries.push(`${a.name}: ${a.val}`);
      } else {
        attrEntries.push(`${a.name}: __v(function(){ return ${a.val} })`);
      }
    }
  }

  const hasHrefAttr = node.attrs?.some((a) => (a as { name: string }).name === "href");
  if (node.name === "a" && !hasHrefAttr) {
    attrEntries.unshift(`href: ""`);
  }

  const dataParts: string[] = [];
  if (attrEntries.length > 0) dataParts.push(`attrs: { ${attrEntries.join(", ")} }`);
  if (dynamicClassEntries.length > 0) dataParts.push(`class: { ${dynamicClassEntries.join(", ")} }`);
  if (eventEntries.length > 0) dataParts.push(`on: { ${eventEntries.join(", ")} }`);

  const blockResult = node.block ? generateBlock(node.block) : { exprs: [] as string[], stmts: [] as string[] };

  let childrenExpr = "";
  if (blockResult.exprs.length === 1 && blockResult.stmts.length === 0) {
    childrenExpr = blockResult.exprs[0];
  } else if (blockResult.exprs.length > 1 && blockResult.stmts.length === 0) {
    childrenExpr = `[${blockResult.exprs.join(", ")}]`;
  } else if (blockResult.stmts.length > 0) {
    const innerStmts = blockResult.stmts.join("; ") + ";";
    const innerRet = blockResult.exprs.length === 1
      ? `return ${blockResult.exprs[0]};`
      : `return [${blockResult.exprs.join(", ")}];`;
    childrenExpr = `(function(__d) { with(window.__handlerScope(__d)) { ${innerStmts} ${innerRet} } })(data)`;
  }

  const hasRest = node.attrs?.some((a) => (a as { name: string }).name === "rest");
  const hasAction = node.attrs?.some((a) => (a as { name: string }).name === "action");
  const hasHref = node.attrs?.some((a) => (a as { name: string }).name === "href");
  const needsTpl = (node.name === "pug-page" && hasRest) ||
    (node.name === "form" && (hasRest || (hasAction && hasHref)));
  if (needsTpl && childrenExpr) {
    // stmts path uses its own with(__handlerScope(__d)) — outer with(data) would shadow 'data'
    const hasOwnScope = blockResult.stmts.length > 0;
    const tplWrapper = hasOwnScope
      ? `__tpl: function(data){return ${childrenExpr}}`
      : `__tpl: function(data){with(data){return ${childrenExpr}}}`;
    dataParts.push(tplWrapper);
    dataParts.push(`hook: { create(_,vn){vn.elm.__tpl=vn.data.__tpl; vn.elm.__needsScope=true} }`);
    childrenExpr = "";
  }

  if (isCustomTag(node.name!)) {
    emitCustomTagData(node, dataParts, blockResult);
    childrenExpr = "";
  }

  const dataStr = dataParts.length > 0 ? `{ ${dataParts.join(", ")} }` : "";

  let hExpr: string;
  if (dataStr && childrenExpr) hExpr = `h("${selector}", ${dataStr}, ${childrenExpr})`;
  else if (childrenExpr) hExpr = `h("${selector}", ${childrenExpr})`;
  else if (dataStr) hExpr = `h("${selector}", ${dataStr})`;
  else hExpr = `h("${selector}")`;

  const conditions: string[] = [];
  if (roleCond) conditions.push(roleCond);
  if (langCond) conditions.push(langCond);

  if (conditions.length > 0) {
    return `(${conditions.join(" && ")} ? ${hExpr} : null)`;
  }
  return hExpr;
}

function buildRoleCondition(val: string): string {
  if (val.startsWith("[")) {
    return `$user.roles && $user.roles.some(function(r){return ${val}.indexOf(r)>=0})`;
  }
  return `$user.roles && $user.roles.includes(${val})`;
}

function buildLangCondition(val: string): string {
  if (val.startsWith("[")) {
    return `$user.lang && ${val}.indexOf($user.lang) >= 0`;
  }
  return `$user.lang === ${val}`;
}

function generateInterpolatedTag(node: PugASTNode): string {
  const tagExpr = (node as Record<string, unknown>).expr ?? '"div"';
  const blockResult = node.block ? generateBlock(node.block) : { exprs: [] as string[], stmts: [] as string[] };
  const childrenExpr = blockResult.exprs.length > 0
    ? (blockResult.exprs.length === 1 ? blockResult.exprs[0] : `[${blockResult.exprs.join(", ")}]`)
    : "";

  if (childrenExpr) return `h(${String(tagExpr)}, {}, ${childrenExpr})`;
  return `h(${String(tagExpr)})`;
}

function generateLiteral(node: PugASTNode): string {
  const html = node.val ?? "";
  const escaped = JSON.stringify(html);
  return `h("span", { hook: { insert(vn) { vn.elm.innerHTML = ${escaped}; } } })`;
}

function rawHtmlSpan(expr: string): string {
  if (expr === "__content") return expr;
  return [
    `h("span", { `,
    `hook: { `,
    `insert(vn) { vn.elm.innerHTML = __s(${expr}); }, `,
    `update(_o, vn) { vn.elm.innerHTML = __s(${expr}); } `,
    `}, `,
    `rawHtml: ${expr} `,
    `})`,
  ].join("");
}

function generateConditional(node: PugASTNode): string {
  const negate = (node as Record<string, unknown>).negate === true;
  const testExpr = negate ? `!(${node.test!})` : node.test!;

  const conBlock = node.consequent
    ? generateBlock(node.consequent)
    : { exprs: [] as string[], stmts: [] as string[] };

  let altExpr: string;
  if (node.alternate) {
    if (node.alternate.type === "Conditional") {
      altExpr = generateConditional(node.alternate);
    } else {
      altExpr = blockToExpr(generateBlock(node.alternate));
    }
  } else {
    altExpr = "null";
  }

  return `(${testExpr} ? ${blockToExpr(conBlock)} : ${altExpr})`;
}

function generateEach(node: PugASTNode): string {
  const objExpr = node.obj!;
  const valName = node.val!;
  const keyName = node.key;

  const blockResult = generateBlock(node.block!);
  const bodyExpr = blockToExpr(blockResult);

  const cbArgs = keyName
    ? `function(${valName}, ${keyName})`
    : `function(${valName})`;

  const mapExpr = `(${objExpr} || []).map(${cbArgs} { return ${bodyExpr}; })`;

  if (node.alternate) {
    const altExpr = blockToExpr(generateBlock(node.alternate));
    return `((${objExpr} && ${objExpr}.length) ? ${mapExpr} : ${altExpr})`;
  }

  return mapExpr;
}

function generateEachOf(node: PugASTNode): string {
  const objExpr = node.obj!;
  const valName = node.val!;
  const keyName = node.key;

  const blockResult = generateBlock(node.block!);
  const bodyExpr = blockToExpr(blockResult);

  const keysExpr = `Object.keys(${objExpr} || {})`;
  const cb = keyName
    ? `function(${keyName}) { var ${valName} = (${objExpr})[${keyName}]; return ${bodyExpr}; }`
    : `function(__k) { var ${valName} = (${objExpr})[__k]; return ${bodyExpr}; }`;

  return `${keysExpr}.map(${cb})`;
}

function generateCase(node: PugASTNode): string {
  const rawExpr = (node as Record<string, unknown>).expr as string;
  const whenNodes = node.block?.nodes?.filter((n) => n.type === "When") ?? [];

  if (whenNodes.length === 0) return "null";

  const cases: string[] = [];
  let defaultBody: string | null = null;

  for (const w of whenNodes) {
    const wExpr = (w as Record<string, unknown>).expr as string;
    const bResult = w.block
      ? generateBlock(w.block)
      : { exprs: [] as string[], stmts: [] as string[] };
    const bodyExpr = blockToExpr(bResult);

    if (!wExpr || wExpr === "default") {
      defaultBody = bodyExpr;
    } else {
      cases.push(`case ${wExpr}: return ${bodyExpr};`);
    }
  }

  let switchBody = cases.join(" ");
  if (defaultBody !== null) {
    switchBody += ` default: return ${defaultBody};`;
  }

  return `(function() { switch(${rawExpr}) { ${switchBody} } })()`;
}

function generateWhile(node: PugASTNode): string {
  const testExpr = node.test!;
  const blockResult = generateBlock(node.block!);
  const bodyExpr = blockToExpr(blockResult);

  return `(function() { var __r = []; while (${testExpr}) { __r.push(${bodyExpr}); } return __r; })()`;
}

function isStaticString(val: string): boolean {
  return (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('"') && val.endsWith('"'));
}

function extractString(val: string): string {
  return val.slice(1, -1);
}

function hasMixinBlock(node: PugASTNode): boolean {
  if (node.type === "MixinBlock") return true;
  if (node.nodes) {
    for (const child of node.nodes) {
      if (hasMixinBlock(child)) return true;
    }
  }
  if (node.block && hasMixinBlock(node.block)) return true;
  return false;
}

function splitMixinArgs(argsStr: string): string[] {
  if (!argsStr.trim()) return [];
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (inString) {
      current += ch;
      if (ch === inString && argsStr[i - 1] !== "\\") inString = null;
    } else if (ch === '"' || ch === "'") {
      current += ch;
      inString = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      current += ch;
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      current += ch;
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function generateMixinDef(node: PugASTNode): string {
  const name = node.name!;
  const paramNames = splitMixinArgs(node.args || "");
  const needsBlockParam = node.block ? hasMixinBlock(node.block) : false;

  const allParams = [...paramNames];
  if (needsBlockParam) allParams.push("__block_content");

  const body = node.block
    ? generateBlock(node.block)
    : { exprs: [] as string[], stmts: [] as string[] };

  let returnExpr: string;
  if (body.exprs.length === 0 && body.stmts.length === 0) {
    returnExpr = "null";
  } else if (body.exprs.length === 1 && body.stmts.length === 0) {
    returnExpr = body.exprs[0];
  } else {
    returnExpr = blockToExpr(body);
  }

  const funcBody = body.stmts.length > 0
    ? `${body.stmts.join("; ")}; return ${returnExpr};`
    : `return ${returnExpr};`;

  return `function __mixin_${name}(${allParams.join(", ")}) { ${funcBody} }`;
}

function generateMixinCall(node: PugASTNode): string {
  const name = node.name!;
  const callArgs = splitMixinArgs(node.args || "").map((a) => a.trim()).filter(Boolean).join(", ");

  let blockContentExpr = "";
  if (node.block) {
    const blockResult = generateBlock(node.block);
    blockContentExpr = blockToExpr(blockResult);
  }

  const allArgs = blockContentExpr
    ? (callArgs ? `${callArgs}, ${blockContentExpr}` : blockContentExpr)
    : callArgs;

  return `__mixin_${name}(${allArgs})`;
}
