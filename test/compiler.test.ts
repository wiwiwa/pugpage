import { startDevServer } from "../src/dev.ts";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

Deno.test("compiler.compile", async () => {
  const server = await startDevServer({ root: "test/pages", port: 0, watch: false });
  const { port } = server.addr as Deno.NetAddr;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);

  await expect(page.locator("body")).toContainText("Hello");

  await page.locator("a.showUser").click();
  await expect(page.locator("pug-page")).toContainText("Alice");
  await expect(page.locator("h1")).toContainText("Home Layout");
  const styleText = await page.locator("style").evaluateAll((els) => els.map((e) => e.textContent).join(""));
  expect(styleText).toContain("list-style");

  await browser.close();
  server.shutdown();
});
