import { parse } from "@std/yaml";
import { chromium, type Page, type Browser } from "playwright";
import { startDevServer } from "./dev.ts";

interface ActionGroup {
  goto?: string;
  url?: string;
  text?: string | string[];
  has?: string | string[];
  no?: string | string[];
  fill?: Record<string, string>[];
  select?: Record<string, string>[];
  click?: string | string[];
  wait?: string | string[];
  waitText?: string | string[];
  timeout?: number;
  status?: number;
}

interface TestCase {
  name: string;
  groups: ActionGroup[];
}

function asArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionGroupList(value: unknown): value is ActionGroup[] {
  return Array.isArray(value) && value.every(isRecord);
}

function flattenScenarioTests(node: unknown, path: string[] = []): TestCase[] {
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
      cases.push({ name: nextPath.join(" > "), groups: value });
      continue;
    }
    if (isRecord(value)) {
      cases.push(...flattenScenarioTests(value, nextPath));
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
  group: ActionGroup,
): Promise<string | null> {
  const timeout = group.timeout ?? 5000;
  let response = null;

  if (group.goto) {
    const targetUrl = new URL(group.goto, baseUrl).href;
    response = await page.goto(targetUrl, { timeout, waitUntil: "load" });
  }

  if (group.status !== undefined && response?.status() !== group.status) {
    return `${label}: expected status ${group.status}, got ${response?.status()}`;
  }

  for (const entry of group.fill ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).fill(value);
  }

  for (const entry of group.select ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).selectOption(value);
  }

  for (const sel of asArray(group.click)) {
    await page.locator(sel).click();
  }

  for (const sel of asArray(group.wait)) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout });
    } catch {
      return `${label}: wait for "${sel}" timed out`;
    }
  }

  for (const text of asArray(group.waitText)) {
    try {
      await page.locator("body").filter({ hasText: text }).waitFor({ timeout });
    } catch {
      return `${label}: waitText "${text}" timed out`;
    }
  }

  if (group.url) {
    const expected = new URL(group.url, baseUrl).pathname;
    try {
      await page.waitForURL((url) => url.pathname === expected || url.pathname === expected.replace(/\/$/, ""), { timeout });
    } catch {
      const actual = new URL(page.url()).pathname;
      return `${label}: expected url ${expected}, got ${actual} (timed out)`;
    }
  }

  for (const text of asArray(group.text)) {
    try {
      await page.locator("body").filter({ hasText: text }).waitFor({ timeout });
    } catch {
      return `${label}: text "${text}" not found`;
    }
  }

  for (const sel of asArray(group.has)) {
    try {
      await page.locator(sel).first().waitFor({ state: "attached", timeout });
    } catch {
      return `${label}: expected "${sel}" to exist`;
    }
  }

  for (const sel of asArray(group.no)) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      return `${label}: expected "${sel}" not to exist, found ${count}`;
    }
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
  const testCases = flattenScenarioTests(parsed);

  const server = await startDevServer({
    root: opts.root,
    port: 0,
    watch: false,
    proxyTarget: opts.proxyTarget,
    staticDir: opts.staticDir,
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
