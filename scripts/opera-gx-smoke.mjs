import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const endpoint = process.env.OPERA_GX_CDP_URL ?? `http://127.0.0.1:${process.env.OPERA_GX_CDP_PORT ?? 9222}`;
const artifactDir = path.resolve(process.cwd(), "artifacts");
mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.connectOverCDP(endpoint);
const context = browser.contexts()[0];
if (!context) throw new Error("Opera GX CDP connected but did not expose a browser context.");
const page = await context.newPage();
const consoleEntries = [];
const requests = [];
page.on("console", (message) => consoleEntries.push({ type: message.type(), text: message.text() }));
page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));

try {
  await page.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 20_000 });
  const externalTitle = await page.title();
  await page.setContent(`<!doctype html><html><body><h1>Opera GX CDP smoke test</h1><input aria-label="demo input"><button>Test click</button><output></output><script>document.querySelector('button').addEventListener('click',()=>{document.querySelector('output').textContent=document.querySelector('input').value;console.log('button-clicked')})</script></body></html>`);
  await page.getByLabel("demo input").fill("Zark Playwright CDP");
  await page.getByRole("button", { name: "Test click" }).click();
  const domValue = await page.locator("output").textContent();
  const screenshotPath = path.join(artifactDir, "opera-gx-cdp-smoke.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const report = {
    endpoint,
    connected: true,
    externalNavigation: { url: "https://example.com/", title: externalTitle },
    domRead: domValue,
    clickAndTypePassed: domValue === "Zark Playwright CDP",
    console: consoleEntries,
    network: requests.slice(0, 20),
    screenshotPath,
  };
  writeFileSync(path.join(artifactDir, "opera-gx-cdp-smoke.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.clickAndTypePassed || !requests.length || !consoleEntries.some((item) => item.text === "button-clicked")) process.exitCode = 1;
} finally {
  await page.close();
  await browser.close();
}
