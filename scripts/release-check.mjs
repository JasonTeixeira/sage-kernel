import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [
  ["npm", ["run", "catalog:validate"]],
  ["npm", ["run", "intelligence:validate"]],
  ["npm", ["run", "adapters:validate"]],
  ["npm", ["run", "runbooks:validate"]],
  ["npm", ["run", "infra:validate"]],
  ["npm", ["run", "jobs:validate"]],
  ["npm", ["run", "mcp:validate"]],
  ["npm", ["run", "mcp:contracts"]],
  ["npm", ["run", "mcp:smoke"]],
  ["npm", ["run", "soak:quick"]],
  ["npm", ["run", "template:validate-blueprints"]],
  ["npm", ["run", "v03:validate"]],
  ["npm", ["run", "security:scan"]],
  ["npm", ["audit"]],
  ["npm", ["run", "public:validate"]],
  ["npm", ["run", "release:provenance"]],
  ["npm", ["run", "qa:gate"]],
  ["npm", ["pack", "--dry-run"]]
];

const results = checks.map(([command, args]) => run(command, args));
const failed = results.filter((result) => result.status !== 0);

console.log(JSON.stringify({
  status: failed.length === 0 ? "passed" : "failed",
  checks: results.map(({ command, args, status }) => ({ command: [command, ...args].join(" "), status }))
}, null, 2));

process.exit(failed.length === 0 ? 0 : 1);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
  }
  return { command, args, status: result.status ?? 1 };
}
