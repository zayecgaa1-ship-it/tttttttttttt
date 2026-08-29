import { spawn } from "node:child_process";

const services = [
  spawn(process.execPath, ["dist/apps/api/src/index.js"], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["dist/apps/bot/src/index.js"], { stdio: "inherit", env: process.env }),
];
let stopping = false;

function stop(signal = "SIGTERM", exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const service of services) if (!service.killed) service.kill(signal);
  const forceTimer = setTimeout(() => {
    for (const service of services) if (!service.killed) service.kill("SIGKILL");
  }, 8_000);
  forceTimer.unref();
  process.exitCode = exitCode;
}

for (const service of services) {
  service.once("error", (error) => {
    console.error("Failed to start a Zark service", error);
    stop("SIGTERM", 1);
  });
  service.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`A Zark service stopped unexpectedly (${signal ?? code ?? "unknown"})`);
      stop("SIGTERM", code || 1);
    }
  });
}

process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));
