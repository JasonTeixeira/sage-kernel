import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "generated/dogfood");
const apps = [
  ["next-saas-app", "dogfood-saas-ops"],
  ["next-ai-app", "dogfood-ai-copilot"],
  ["fastapi-service", "dogfood-api-service"]
];

fs.mkdirSync(out, { recursive: true });

const results = [];
for (const [template, name] of apps) {
  const target = path.join(out, name);
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  const result = spawnSync("node", ["packages/templates/scripts/template-scaffold-v2.mjs", "--template", template, "--name", name, "--out", "generated/dogfood"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4
  });
  results.push({ template, name, status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() });
  if (result.status !== 0) break;
}

const failed = results.find((item) => item.status !== 0);
if (failed) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ generated: results.map((item) => item.name) }, null, 2));
