import { startDevServer } from "../src/dev.ts";
import { chromium } from "playwright";
import { expect } from "@playwright/test";

Deno.test("End2End Test", async () => {
  const server = await startDevServer({ root: "test/pages", port: 0, watch: false });
  const { port } = server.addr as Deno.NetAddr;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();

  // Clear any stored auth state
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // Visit / — layout pug-page fetches /$$dev/api/login → 401 → redirect to /login
  await page.goto(`http://localhost:${port}/`);
  await page.waitForURL(/\/login\/?$/);
  await expect(page.locator("h1").last()).toContainText("Login");

  // Submit login form
  await page.click('button[type="submit"]');

  // Should redirect back to /, now showing logout link (auth token stored)
  await expect(page).toHaveURL(`http://localhost:${port}/`);
  await expect(page.locator("a.logout")).toContainText("Logout");

  // Refresh — auth token persists in session storage
  await page.reload();
  await expect(page.locator("a.logout")).toContainText("Logout");

  // User link still works
  await page.locator("a.showUser").click();
  await expect(page.locator("body")).toContainText("demo");
  const styleText = await page.locator("style").evaluateAll((els) => els.map((e) => e.textContent).join(""));
  expect(styleText).toContain(".sass-card");

  await browser.close();
  server.shutdown();
});
