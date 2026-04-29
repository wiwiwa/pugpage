/**
 * Compile-time CSS scoping via data-scope attribute.
 *
 * When a <style> element is found in a pug template, the CSS selectors
 * are scoped using a `data-scope` attribute derived from the file path hash.
 * The corresponding parent element in the template gets the same attribute.
 */

export interface ScopeResult {
  css: string;
  scopeId: string;
}

/**
 * Generate a short hash from a string for use as scope ID.
 */
function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 6).padStart(6, "0");
}

export function scopeCss(cssSource: string, filePath: string): ScopeResult {
  const scopeId = hashString(filePath);
  const prefix = `[data-scope="${scopeId}"]`;

  let depth = 0;
  let output = "";

  for (let i = 0; i < cssSource.length; i++) {
    const ch = cssSource[i];

    if (ch === "{") {
      depth++;
      output += ch;
      continue;
    }

    if (ch === "}") {
      depth--;
      output += ch;
      continue;
    }

    // At depth 0, detect selectors before '{'
    if (depth === 0) {
      // Look ahead for '{' at depth 0
      if (ch === "@" || /[a-zA-Z*:.#\[\]>~+]/.test(ch)) {
        const rest = cssSource.slice(i);
        const braceIdx = findTopLevelBrace(rest);
        if (braceIdx > 0) {
          const selectorPart = rest.slice(0, braceIdx);
          const trimmed = selectorPart.trim();

          if (trimmed.startsWith("@")) {
            output += selectorPart;
            i += braceIdx - 1;
            continue;
          }

          const scoped = scopeSelectors(selectorPart, prefix);
          output += scoped;
          i += braceIdx - 1;
          continue;
        }
      }
    }

    output += ch;
  }

  return { css: output, scopeId };
}

function findTopLevelBrace(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") return i;
    if (s[i] === "}" || s[i] === ";") break;
  }
  return -1;
}

function scopeSelectors(selectorPart: string, prefix: string): string {
  const lines = selectorPart.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { result.push(line); continue; }

    if (/^[\d.]+%$/.test(trimmed) || /^(from|to)$/.test(trimmed)) {
      result.push(line);
      continue;
    }

    const selectors = trimmed.split(",").map((s: string) => {
      const t = s.trim();
      if (!t) return s;
      return `${prefix} ${t}`;
    });

    result.push(line.replace(trimmed, selectors.join(",")));
  }

  return result.join("\n");
}
