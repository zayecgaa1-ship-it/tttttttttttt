import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const endpoint = process.env.OPERA_GX_CDP_URL ?? `http://127.0.0.1:${process.env.OPERA_GX_CDP_PORT ?? 9222}`;
const siteUrl = (process.env.ZARK_GUIDE_SITE_URL ?? "https://zark-ps.com").replace(/\/$/, "");
const outputDir = path.resolve(process.cwd(), "docs", "assets", "zark-usage-guide");
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
if (!context) throw new Error("Opera GX is connected but has no browser context.");
const page = await context.newPage();
const captures = [
  ["01-home.png", "/"],
  ["02-lfg.png", "/lfg.html"],
  ["03-games.png", "/games.html"],
  ["04-support.png", "/reports.html"],
];

try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, route] of captures) {
    await page.goto(`${siteUrl}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.screenshot({ path: path.join(outputDir, name), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${siteUrl}/lfg.html`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.screenshot({ path: path.join(outputDir, "05-lfg-mobile.png"), fullPage: true });
  console.log(JSON.stringify({ siteUrl, outputDir, captures: [...captures.map(([name]) => name), "05-lfg-mobile.png"] }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
