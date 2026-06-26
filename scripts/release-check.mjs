import { spawnSync } from "node:child_process";
import { recordProof } from "../packages/proof/ledger.mjs";

const root = process.cwd();
const releaseRunId = `run_release_${new Date().toISOString()}`;
const checks = [
  ["npm", ["run", "catalog:validate"]],
  ["npm", ["run", "intelligence:validate"]],
  ["npm", ["run", "adapters:validate"]],
  ["npm", ["run", "agents:validate"]],
  ["npm", ["run", "agents:eval"]],
  ["npm", ["run", "profiles:validate"]],
  ["npm", ["run", "profiles:prove"]],
  ["npm", ["run", "profiles:prove-paths"]],
  ["npm", ["run", "workflows:validate"]],
  ["npm", ["run", "workflows:prove"]],
  ["npm", ["run", "workflows:engine"]],
  ["npm", ["run", "workflows:e2e"]],
  ["npm", ["run", "review:validate"]],
  ["npm", ["run", "drift:validate"]],
  ["npm", ["run", "runbooks:validate"]],
  ["npm", ["run", "infra:validate"]],
  ["npm", ["run", "jobs:validate"]],
  ["npm", ["run", "mcp:validate"]],
  ["npm", ["run", "mcp:contracts"]],
  ["npm", ["run", "mcp:smoke"]],
  ["npm", ["run", "mcp:clients:prove"]],
  ["npm", ["run", "soak:quick"]],
  ["npm", ["run", "redteam:fixtures"]],
  ["npm", ["run", "benchmark:matrix"]],
  ["npm", ["run", "benchmark:corpus"]],
  ["npm", ["run", "stress:matrix"]],
  ["npm", ["run", "retrieval:prove"]],
  ["npm", ["run", "orchestration:prove"]],
  ["npm", ["run", "chaos:matrix"]],
  ["npm", ["run", "perf:incremental"]],
  ["npm", ["run", "runtime:gate"]],
  ["npm", ["run", "autonomy:harness"]],
  ["npm", ["run", "intake:proof"]],
  ["npm", ["run", "generation:proof"]],
  ["npm", ["run", "deploy:proof"]],
  ["npm", ["run", "sdlc:e2e"]],
  ["npm", ["run", "observability:prove"]],
  ["npm", ["run", "template:validate-blueprints"]],
  ["npm", ["run", "templates:e2e"]],
  ["npm", ["run", "templates:benchmark"]],
  ["npm", ["run", "v03:validate"]],
  ["npm", ["run", "security:scan"]],
  ["npm", ["run", "security:polyglot"]],
  ["npm", ["run", "security:dataflow"]],
  ["npm", ["run", "security:corpus"]],
  ["npm", ["run", "security:holdout"]],
  ["npm", ["run", "security:holdout-fresh"]],
  ["npm", ["run", "profile:accuracy-fresh"]],
  ["npm", ["run", "hallucination:efficacy"]],
  ["npm", ["run", "security:threat-model"]],
  ["npm", ["run", "supply-chain:scan"]],
  ["npm", ["run", "security:e2e"]],
  ["npm", ["run", "testing:proof"]],
  ["npm", ["run", "release:evidence"]],
  ["npm", ["run", "memory:graph"]],
  ["npm", ["run", "memory:learn"]],
  ["npm", ["run", "memory:e2e"]],
  ["npm", ["run", "score:validate"]],
  ["npm", ["run", "score:report"]],
  ["npm", ["run", "score:benchmarks"]],
  ["npm", ["run", "score:regression"]],
  ["npm", ["run", "self:heal"]],
  ["npm", ["run", "audit:full"]],
  ["npm", ["audit"]],
  ["npm", ["run", "public:validate"]],
  ["npm", ["run", "release:provenance"]],
  ["npm", ["run", "verify:global-install"]],
  ["npm", ["run", "status:honesty"]],
  ["npm", ["run", "qa:gate"]],
  ["npm", ["run", "proof:ledger"]],
  ["npm", ["run", "proof:graph"]],
  ["npm", ["run", "hallucination:gate"]],
  ["npm", ["run", "dead-code"]],
  ["npm", ["run", "quality:complexity"]],
  ["npm", ["run", "test:coverage"]],
  ["npm", ["run", "policy:validate"]],
  ["npm", ["run", "security:dlp"]],
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
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  const status = result.status ?? 1;
  if (status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
  }
  // Every release gate writes a proof record (best-effort; proof recording must
  // never mask or break the underlying check result).
  try {
    recordProof(
      {
        tool: `${command} ${args.join(" ")}`.trim(),
        command: `${command} ${args.join(" ")}`.trim(),
        input: { command, args },
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        exitCode: status,
        status: status === 0 ? "passed" : "failed",
        verifier: "release-check",
        runId: releaseRunId,
        startedAt,
        finishedAt: new Date().toISOString()
      },
      { root }
    );
  } catch (error) {
    process.stderr.write(`[release-check] proof recording failed: ${error.message}\n`);
  }
  return { command, args, status };
}
