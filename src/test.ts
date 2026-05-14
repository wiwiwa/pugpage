import { parse } from "@std/yaml";
import { chromium, type Page, type Browser, type Response } from "playwright";
import { startDevServer } from "./dev.ts";

type SelectorTextMap = Record<string, string | string[]>;
type SelectorTarget = string | SelectorTextMap | Array<string | SelectorTextMap>;

interface ActionGroup {
  goto?: string;
  url?: string;
  has?: SelectorTarget;
  no?: SelectorTarget;
  fill?: Record<string, string>;
  select?: Record<string, string>;
  click?: SelectorTarget;
  wait?: SelectorTarget;
  timeout?: number;
  status?: number;
  js?: string;
}

interface TestCase {
  name: string;
  groups: Record<string, unknown>[];
}


function normalizeSelectorTargets(target: SelectorTarget | undefined): Array<[string, string | string[] | null]> {
  if (!target) return [];
  if (typeof target === "string") return [[target, null]];
  if (Array.isArray(target)) {
    const result: Array<[string, string | string[] | null]> = [];
    for (const item of target) {
      if (typeof item === "string") result.push([item, null]);
      else for (const [sel, texts] of Object.entries(item)) result.push([sel, texts]);
    }
    return result;
  }
  return Object.entries(target);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionGroupList(value: unknown): value is ActionGroup[] {
  return Array.isArray(value) && value.every(isRecord);
}

function flattenTestTree(node: unknown, path: string[] = []): TestCase[] {
  if (!isRecord(node)) {
    throw new Error(`Invalid test file: ${path.join(" > ") || "root"} must be an object`);
  }

  const cases: TestCase[] = [];
  for (const [name, value] of Object.entries(node)) {
    const nextPath = [...path, name];
    if (isActionGroupList(value)) {
      if (value.length === 0) {
        throw new Error(`Invalid test case ${nextPath.join(" > ")}: must contain at least one action group`);
      }
      cases.push({ name: nextPath.join(" > "), groups: value as Record<string, unknown>[] });
      continue;
    }
    if (isRecord(value)) {
      cases.push(...flattenTestTree(value, nextPath));
      continue;
    }
    throw new Error(`Invalid test node ${nextPath.join(" > ")}: expected object or action group list`);
  }
  return cases;
}

async function runActionGroup(
  page: Page,
  baseUrl: string,
  label: string,
  group: Record<string, unknown>,
): Promise<string | null> {
  const timeout = (group.timeout as number) ?? 5000;
  let response: Response | null = null;

  const actionFns: Record<string, (val: unknown) => Promise<string | null>> = {
    async goto(val) {
      const targetUrl = new URL(val as string, baseUrl).href;
      response = await page.goto(targetUrl, { timeout, waitUntil: "load" });
      return null;
    },
    async status(val) {
      if (response?.status() !== (val as number)) {
        return `${label}: expected status ${val}, got ${response?.status()}`;
      }
      return null;
    },
    async fill(val) {
      for (const [selector, value] of Object.entries(val as Record<string, string>)) {
        await page.locator(selector).fill(value, { timeout });
      }
      return null;
    },
    async select(val) {
      for (const [selector, value] of Object.entries(val as Record<string, string>)) {
        await page.locator(selector).selectOption(value, { timeout });
      }
      return null;
    },
    async click(val) {
      for (const [sel, texts] of normalizeSelectorTargets(val as SelectorTarget)) {
        if (texts) {
          for (const t of Array.isArray(texts) ? texts : [texts]) {
            await page.locator(sel).filter({ hasText: t }).first().click({ timeout });
          }
        } else {
          await page.locator(sel).first().click({ timeout });
        }
      }
      return null;
    },
    async wait(val) {
      for (const [sel, texts] of normalizeSelectorTargets(val as SelectorTarget)) {
        try {
          if (texts) {
            for (const t of Array.isArray(texts) ? texts : [texts]) {
              await page.locator(sel).filter({ hasText: t }).first().waitFor({ state: "visible", timeout });
            }
          } else {
            await page.locator(sel).first().waitFor({ state: "visible", timeout });
          }
        } catch {
          return `${label}: wait for "${sel}" timed out`;
        }
      }
      return null;
    },
    async url(val) {
      const expected = new URL(val as string, baseUrl).pathname;
      try {
        await page.waitForURL((url) => url.pathname === expected || url.pathname === expected.replace(/\/$/, ""), { timeout });
      } catch {
        const actual = new URL(page.url()).pathname;
        return `${label}: expected url ${expected}, got ${actual} (timed out)`;
      }
      return null;
    },
    async has(val) {
      for (const [sel, texts] of normalizeSelectorTargets(val as SelectorTarget)) {
        try {
          if (texts) {
            for (const t of Array.isArray(texts) ? texts : [texts]) {
              await page.locator(sel).filter({ hasText: t }).first().waitFor({ state: "attached", timeout });
            }
          } else {
            await page.locator(sel).first().waitFor({ state: "attached", timeout });
          }
        } catch {
          return `${label}: expected "${sel}" to exist`;
        }
      }
      return null;
    },
    async no(val) {
      for (const [sel, texts] of normalizeSelectorTargets(val as SelectorTarget)) {
        if (texts) {
          for (const t of Array.isArray(texts) ? texts : [texts]) {
            const count = await page.locator(sel).filter({ hasText: t }).count();
            if (count > 0) return `${label}: expected "${sel}" with text "${t}" not to exist, found ${count}`;
            }
        } else {
          const count = await page.locator(sel).count();
          if (count > 0) return `${label}: expected "${sel}" not to exist, found ${count}`;
          }
        }
      return null;
    },
    async js(val) {
      const injected = await page.evaluate(() => "jQuery" in window);
      if (!injected) {
        await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js" });
      }
      const result = await page.evaluate(val as string);
      if (result !== undefined) console.log(`  [js] ${JSON.stringify(result)}`);
      return null;
    },
  };

  for (const [key, val] of Object.entries(group)) {
    if (key === "timeout") continue;
    const fn = actionFns[key];
    if (!fn) continue;
    const failure = await fn(val);
    if (failure) return failure;
  }

  return null;
}

async function runTestCase(page: Page, baseUrl: string, testCase: TestCase): Promise<string | null> {
  for (let i = 0; i < testCase.groups.length; i++) {
    const failure = await runActionGroup(page, baseUrl, `${testCase.name} [${i + 1}]`, testCase.groups[i]);
    if (failure) return failure;
  }
  return null;
}

export interface RunTestsOptions {
  root: string;
  testFile: string;
  proxyTarget?: string;
  staticDir?: string;
}

export async function runTests(opts: RunTestsOptions): Promise<boolean> {
  const parsed = parse(await Deno.readTextFile(opts.testFile));
  const testCases = flattenTestTree(parsed);

  const server = await startDevServer({
    root: opts.root,
    port: 0,
    watch: false,
    proxyTarget: opts.proxyTarget,
    staticDir: opts.staticDir,
    quiet: true,
  });
  const { port } = server.addr as Deno.NetAddr;
  const baseUrl = `http://localhost:${port}`;

  const browser: Browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // Clear stored auth state
  await page.goto(baseUrl);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  let allPassed = true;

  for (const testCase of testCases) {
    Deno.stdout.write(new TextEncoder().encode(`  ${testCase.name} ... `));

    const failure = await runTestCase(page, baseUrl, testCase);

    if (failure) {
      console.log("\x1b[31mFAILED\x1b[0m");
      console.log(`    ${opts.testFile}: ${failure}`);
      allPassed = false;
      break;
    } else {
      console.log("\x1b[32mok\x1b[0m");
    }
  }

  await browser.close();
  server.shutdown();

  return allPassed;
}
