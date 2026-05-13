/**
 * Layout auto-application for PugPage.
 *
 * At compile time, finds `layout.pug` files and maps pages to their
 * nearest layout. Layouts use `slot` to inject page content.
 * Pages compile as content-only functions. Runtime composes them via pug_layout_map.
 */

import { walk } from "@std/fs/walk";
import { dirname, resolve, extname } from "@std/path";

export async function findLayouts(
  dirPath: string,
): Promise<Map<string, string>> {
  const layouts = new Map<string, string>();
  const absDir = Deno.realPathSync(dirPath);

  for await (const entry of walk(absDir, { exts: ["pug"] })) {
    if (entry.isDirectory) continue;
    if (entry.path.endsWith("layout.pug")) {
      const dir = dirname(entry.path);
      layouts.set(dir, Deno.realPathSync(entry.path));
    }
  }

  return layouts;
}

export function resolveLayout(
  pageAbsPath: string,
  layouts: Map<string, string>,
  baseDir: string,
): string | null {
  const absBase = Deno.realPathSync(baseDir);
  let dir = dirname(pageAbsPath);

  while (true) {
    if (layouts.has(dir)) {
      const layoutPath = layouts.get(dir)!;
      if (layoutPath !== pageAbsPath) return layoutPath;
    }
    if (dir === absBase || dir === dirname(dir)) break;
    dir = dirname(dir);
  }

  return null;
}

export function resolveExtendsLayout(
  pageAbsPath: string,
  extendsPath: string,
  baseDir: string,
): string | null {
  const pageDir = dirname(pageAbsPath);
  const withExt = extname(extendsPath) ? extendsPath : extendsPath + ".pug";
  const absPath = resolve(pageDir, withExt);
  try {
    Deno.statSync(absPath);
    return absPath;
  } catch {
    return null;
  }
}

export function toUrlPath(absPath: string, baseDir: string): string {
  const absBase = Deno.realPathSync(baseDir);
  return absPath.slice(absBase.length, -4);
}

export function isLayoutFile(filePath: string): boolean {
  return filePath.endsWith("layout.pug");
}

export function isComponentFile(filePath: string): boolean {
  const name = filePath.slice(filePath.lastIndexOf("/") + 1, -4);
  return name.includes("-");
}
