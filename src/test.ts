import { parse } from "@std/yaml";
import { chromium, type Page, type Browser } from "playwright";
import { startDevServer } from "./dev.ts";

interface TestStep {
  url?: string;
  text?: string | string[];
  has?: string | string[];
  no?: string | string[];
  fill?: Record<string, string>[];
  select?: Record<string, string>[];
  check?: string | string[];
  uncheck?: string | string[];
  click?: string | string[];
  wait?: string | string[];
  waitText?: string | string[];
  timeout?: number;
  status?: number;
}

type TestEntry = Record<string, TestStep>;

function asArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

async function runTestEntry(
  page: Page,
  baseUrl: string,
  route: string,
  step: TestStep,
): Promise<string | null> {
  const label = `${route}`;
  const timeout = step.timeout ?? 5000;

  // Navigate
  const targetUrl = new URL(route, baseUrl).href;
  const response = await page.goto(targetUrl, { timeout, waitUntil: "load" });

  if (step.status && response?.status() !== step.status) {
    return `${label}: expected status ${step.status}, got ${response?.status()}`;
  }

  // Actions in fixed order: fill, select, check, uncheck, click
  for (const entry of step.fill ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).fill(value);
  }

  for (const entry of step.select ?? []) {
    const [selector, value] = Object.entries(entry)[0];
    await page.locator(selector).selectOption(value);
  }

  for (const sel of asArray(step.check)) {
    await page.locator(sel).check();
  }

  for (const sel of asArray(step.uncheck)) {
    await page.locator(sel).uncheck();
  }

  for (const sel of asArray(step.click)) {
    await page.locator(sel).click();
  }

  // Waits
  for (const sel of asArray(step.wait)) {
    try {
      await page.locator(sel).first().waitFor({ state: "visible", timeout });
    } catch {
      return `${label}: wait for "${sel}" timed out`;
    }
  }

  for (const text of asArray(step.waitText)) {
    try {
      await page.locator("body").waitFor({ timeout });
      const body = await page.locator("body").textContent();
      if (!body?.includes(text)) {
        return `${label}: waitText "${text}" not found in body`;
      }
    } catch {
      return `${label}: waitText "${text}" timed out`;
    }
  }

  // Assertions
  // Wait for URL if specified (handles async redirects)
  if (step.url) {
    const expected = new URL(step.url, baseUrl).pathname;
    try {
      await page.waitForURL((url) => url.pathname === expected || url.pathname === expected.replace(/\/$/, ""), { timeout });
    } catch {
      const actual = new URL(page.url()).pathname;
      return `${label}: expected url ${expected}, got ${actual} (timed out)`;
    }
  }

  const bodyText = await page.locator("body").textContent() ?? "";

  for (const text of asArray(step.text)) {
    if (!bodyText.includes(text)) {
      return `${label}: text "${text}" not found`;
    }
  }

  for (const sel of asArray(step.has)) {
    const count = await page.locator(sel).count();
    if (count === 0) {
      return `${label}: expected "${sel}" to exist`;
    }
  }

  for (const sel of asArray(step.no)) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      return `${label}: expected "${sel}" not to exist, found ${count}`;
    }
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

  const entries = parse(await Deno.readTextFile(opts.testFile)) as TestEntry[];
  for (const entry of entries) {
    const [route, step] = Object.entries(entry)[0];
    Deno.stdout.write(new TextEncoder().encode(`  ${route} ... `));

    const failure = await runTestEntry(page, baseUrl, route, step);

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
