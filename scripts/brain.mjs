import { spawnSync } from "node:child_process";

// Activates "the brain": points the provider env vars at the local Claude Code
// CLI adapters and runs the eval suite, or reports activation status.
//   node scripts/brain.mjs check   -> report which providers + claude CLI are available
//   node scripts/brain.mjs evals   -> run the eval suite with the adapters wired

const ADAPTERS = {
  SAGE_AGENT_COMMAND: "node providers/claude-agent.mjs",
  SAGE_VERIFIER_COMMAND: "node providers/claude-verifier.mjs",
  SAGE_MODEL_RUBRIC_COMMAND: "node providers/claude-rubric.mjs"
};

const command = process.argv[2] || "check";

function claudeAvailable() {
  const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 8000 });
  return !probe.error && probe.status === 0 ? probe.stdout.trim() : null;
}

if (command === "check") {
  const claude = claudeAvailable();
  const report = {
    claudeCli: claude || "not found",
    providers: Object.fromEntries(
      Object.keys(ADAPTERS).map((key) => [key, process.env[key] ? `set (${process.env[key]})` : `unset (adapter available: ${ADAPTERS[key]})`])
    ),
    note: "Run `npm run evals:real` to wire the adapters and produce model-backed eval evidence."
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (command === "evals") {
  if (!claudeAvailable()) {
    console.error("Claude Code CLI not found on PATH; cannot run model-backed evals.");
    process.exit(1);
  }
  const env = { ...process.env };
  for (const [key, value] of Object.entries(ADAPTERS)) {
    if (!env[key]) env[key] = value;
  }
  const result = spawnSync(process.execPath, ["packages/intelligence/scripts/eval-runner.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env
  });
  process.exit(result.status ?? 1);
}

console.error(`Unknown command: ${command} (use "check" or "evals")`);
process.exit(2);
