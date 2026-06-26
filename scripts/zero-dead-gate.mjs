import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const checks = [
  {
    files: [
      "apps/worker/jobs.json",
      "catalog/modules.json",
      "apps/mcp-server/tools.json",
      "apps/mcp-server/contracts/tools.snapshot.json",
      "packages/intelligence/evals/100-eval-reliability.json",
      "packages/intelligence/evals/100-full-proof-matrix.json"
    ],
    patterns: [
      /\bplaceholder\b/i,
      /"status"\s*:\s*"planned"/,
      /\bneeds_external_evidence\b/,
      /\bpassed_with_manual_ui_gaps\b/,
      /\bready_without_external_publish\b/,
      /\bmanual_client_launch_required\b/,
      /\bhybrid-lexical-vector-placeholder\b/,
      /\btrace-shaped\b/i,
      /\bDeterministic rubric placeholder\b/
    ]
  },
  {
    files: [
      "packages/orchestration/durable-proof.mjs",
      "packages/observability/proof.mjs",
      "packages/intelligence/retrieval-proof.mjs",
      "packages/intelligence/scripts/eval-runner.mjs",
      "apps/mcp-server/src/sdlc-tools.mjs",
      "packages/core/mcp-client-proof.mjs",
      "scripts/release-pipeline-proof.mjs"
    ],
    patterns: [
      /\bneeds_external_evidence\b/,
      /\bpassed_with_manual_ui_gaps\b/,
      /\bready_without_external_publish\b/,
      /\bmanual_client_launch_required\b/,
      /\bhybrid-lexical-vector-placeholder\b/,
      /\btrace-shaped\b/i,
      /\bDeterministic rubric placeholder\b/,
      /"status"\s*:\s*"planned"/
    ]
  }
];

const failures = [];

const requiredTestFixtureFiles = [
  "packages/security/test-fixtures/redteam.mjs",
  "packages/workflows/test-fixtures/workflow-engine-proof.mjs",
  "packages/benchmark/test-fixtures/corpus.mjs",
  "packages/intelligence/test-fixtures/valid/runbook.json",
  "packages/intelligence/test-fixtures/valid/experiment-run.json",
  "packages/intelligence/test-fixtures/valid/semantic-adapter.json",
  "packages/review/test-fixtures/valid/review-report.json"
];

const forbiddenProductFixtureFiles = [
  "packages/security/redteam-fixtures.mjs",
  "packages/intelligence/fixtures",
  "packages/review/fixtures"
];

for (const group of checks) {
  for (const relativePath of group.files) {
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath)) continue;
    const body = fs.readFileSync(fullPath, "utf8");
    for (const pattern of group.patterns) {
      if (pattern.test(body)) failures.push(`${relativePath}: forbidden shipped-claim marker ${pattern}`);
    }
  }
}

for (const dir of ["packages/api", "packages/auth", "packages/connectors"]) {
  const fullPath = path.join(root, dir);
  if (fs.existsSync(fullPath) && fs.readdirSync(fullPath).length === 0) {
    failures.push(`${dir}: empty product directory`);
  }
}

for (const relativePath of requiredTestFixtureFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`${relativePath}: required executable fixture path missing`);
  }
}

for (const relativePath of forbiddenProductFixtureFiles) {
  if (fs.existsSync(path.join(root, relativePath))) {
    failures.push(`${relativePath}: executable fixtures must live under test-fixtures`);
  }
}

failures.push(...scanGeneratedTemplates(root));

if (failures.length > 0) {
  console.error(`Zero-dead gate failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("Zero-dead gate passed.");

// Scaffold every catalog template into a throwaway workspace and scan the
// generated output for placeholder/scaffold residue. Generated product paths
// must never emit placeholder code.
function scanGeneratedTemplates(rootDir) {
  const fails = [];
  const templatesFile = path.join(rootDir, "catalog/templates.json");
  const scaffold = path.join(rootDir, "packages/templates/scripts/template-scaffold-v2.mjs");
  if (!fs.existsSync(templatesFile) || !fs.existsSync(scaffold)) {
    return [`generated-template-scan: missing catalog/templates.json or template-scaffold-v2.mjs`];
  }
  const { templates } = JSON.parse(fs.readFileSync(templatesFile, "utf8"));
  const banned = [
    /\bplaceholder\b/i,
    /\bTODO\b/,
    /\bFIXME\b/,
    /AI route placeholder/i,
    /Source Placeholder/i,
    /Replace placeholder/i,
    /"status"\s*:\s*"planned"/
  ];
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "sage-zero-dead-templates-"));
  try {
    for (const template of templates) {
      const name = `zero-dead-${template.id}`;
      const result = spawnSync("node", [scaffold, "--template", template.id, "--name", name, "--out", workspace], {
        cwd: rootDir,
        encoding: "utf8"
      });
      if (result.status !== 0) {
        fails.push(`generated:${template.id}: scaffold failed: ${String(result.stderr || "").trim().slice(0, 200)}`);
        continue;
      }
      const projectDir = path.join(workspace, name);
      for (const file of walkFiles(projectDir)) {
        const body = fs.readFileSync(file, "utf8");
        for (const pattern of banned) {
          if (pattern.test(body)) {
            fails.push(`generated:${template.id}:${path.relative(projectDir, file)}: forbidden marker ${pattern}`);
          }
        }
      }
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  return fails;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}
