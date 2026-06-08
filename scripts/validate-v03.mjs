import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "packages/db/postgres.schema.sql",
  "packages/db/scripts/db-export-postgres.mjs",
  "packages/security/guard.mjs",
  "packages/qa/scripts/qa-runner.mjs",
  "apps/worker/scripts/worker-daemon.mjs",
  "apps/dashboard/server.mjs",
  "scripts/dogfood-production-audit.mjs"
];

const requiredPackageScripts = [
  "db:postgres:schema",
  "qa:run",
  "worker:daemon",
  "dashboard:serve",
  "dogfood:prod",
  "v03:validate"
];

const requiredMcpTools = [
  "kernel.approvals.request",
  "kernel.approvals.list",
  "kernel.dashboard.snapshot",
  "kernel.worker.tick",
  "kernel.dogfood.prod"
];

const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing file: ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const script of requiredPackageScripts) {
  if (!pkg.scripts?.[script]) failures.push(`Missing package script: ${script}`);
}

const tools = JSON.parse(fs.readFileSync(path.join(root, "apps/mcp-server/tools.json"), "utf8")).tools;
const toolNames = new Set(tools.map((tool) => tool.name));
for (const tool of requiredMcpTools) {
  if (!toolNames.has(tool)) failures.push(`Missing MCP tool: ${tool}`);
}

const schema = fs.readFileSync(path.join(root, "packages/db/schema.sql"), "utf8");
for (const column of ["locked_at", "locked_by", "next_run_at", "signature"]) {
  if (!schema.includes(column)) failures.push(`SQLite schema missing durable queue/run field: ${column}`);
}

if (failures.length) {
  console.error(`v0.3 validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("v0.3 validation passed.");
