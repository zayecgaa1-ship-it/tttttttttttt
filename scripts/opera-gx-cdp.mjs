import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const port = Number(process.env.OPERA_GX_CDP_PORT ?? 9222);
const endpoint = `http://127.0.0.1:${port}`;
const profileDir = path.resolve(root, ".opera-gx-cdp-profile");
const knownPaths = [
  process.env.OPERA_GX_PATH,
  path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Opera GX", "opera.exe"),
  "C:\\Program Files\\Opera GX\\opera.exe",
  "C:\\Program Files (x86)\\Opera GX\\opera.exe",
].filter(Boolean);

export function resolveOperaGxPath() {
  return knownPaths.find((candidate) => existsSync(candidate));
}

export async function cdpInfo() {
  try {
    const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForCdp(timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const info = await cdpInfo();
    if (info) return info;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Opera GX started but CDP did not respond at ${endpoint}.`);
}

async function start() {
  const running = await cdpInfo();
  if (running) {
    console.log(JSON.stringify({ status: "already-running", endpoint, browser: running.Browser, profileDir }, null, 2));
    return;
  }
  const operaPath = resolveOperaGxPath();
  if (!operaPath) throw new Error("Opera GX was not found. Set OPERA_GX_PATH to opera.exe.");
  mkdirSync(profileDir, { recursive: true });
  const child = spawn(operaPath, [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
  ], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  const info = await waitForCdp();
  console.log(JSON.stringify({ status: "started", endpoint, browser: info.Browser, profileDir, operaPath }, null, 2));
}

async function status() {
  const info = await cdpInfo();
  console.log(JSON.stringify({ status: info ? "running" : "not-running", endpoint, browser: info?.Browser, profileDir, operaPath: resolveOperaGxPath() }, null, 2));
  if (!info) process.exitCode = 1;
}

const command = process.argv[2] ?? "status";
if (command === "start") await start();
else if (command === "status") await status();
else throw new Error("Use: node scripts/opera-gx-cdp.mjs start|status");
