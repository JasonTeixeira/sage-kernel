import { spawn } from "node:child_process";

const port = Number(process.env.SAGE_DASHBOARD_PORT || 8789);
const url = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "dashboard:serve"], {
  env: { ...process.env, SAGE_DASHBOARD_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForDashboard(url);
  const result = await run("npm", ["run", "dashboard:browser-check", "--", `--url=${url}`]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForDashboard(baseUrl) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(new URL("/health", baseUrl));
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Dashboard did not become healthy: ${lastError?.message || "timeout"}`);
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("exit", (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
