import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createBenchmarkMatrixReport } from "./benchmark-matrix.mjs";

const FIXTURES = [
  ["web-app", { dependencies: { react: "^19.0.0", vite: "^7.0.0" }, files: { "src/App.jsx": "export default function App() { return <main />; }\n", "tests/app.test.js": "import 'node:test';\n" } }],
  ["saas-app", { dependencies: { next: "^16.0.0", stripe: "^19.0.0" }, files: { "app/page.tsx": "export default function Page() { return null; }\n", "tests/auth.test.ts": "import 'node:test';\n" } }],
  ["admin-dashboard", { scripts: { "audit-log": "node -e \"process.exit(0)\"" }, files: { "dashboard/admin.js": "export const role = 'admin';\n", "tests/admin.test.js": "import 'node:test';\n" } }],
  ["browser-extension", { files: { "manifest.json": "{\"manifest_version\":3}", "tests/extension.test.js": "import 'node:test';\n" } }],
  ["mobile-app", { dependencies: { expo: "^54.0.0" }, files: { "App.tsx": "export default function App() { return null; }\n", "tests/mobile.test.ts": "import 'node:test';\n" } }],
  ["backend-api", { dependencies: { express: "^5.0.0" }, files: { "src/api/users.js": "export function handler() {}\n", "tests/api.test.js": "import 'node:test';\n" } }],
  ["worker-service", { scripts: { worker: "node worker.js" }, files: { "worker.js": "console.log('worker');\n", "tests/worker.test.js": "import 'node:test';\n" } }],
  ["mcp-server", { dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" }, files: { "apps/mcp-server/src/server.mjs": "export const server = true;\n", "tests/mcp.test.mjs": "import 'node:test';\n" } }],
  ["cli-tool", { bin: { fixture: "bin/fixture.mjs" }, files: { "bin/fixture.mjs": "#!/usr/bin/env node\nconsole.log('ok');\n", "tests/cli.test.mjs": "import 'node:test';\n" } }],
  ["library", { files: { "src/index.js": "export const value = 1;\n", "tests/index.test.js": "import 'node:test';\n" } }],
  ["data-pipeline", { files: { "pipelines/load.sql": "select 1;\n", "tests/pipeline.test.js": "import 'node:test';\n" } }],
  ["data-warehouse-dbt", { files: { "dbt_project.yml": "name: fixture\n", "models/orders.sql": "select 1;\n", "tests/dbt.test.js": "import 'node:test';\n" } }],
  ["trading-system", { files: { "src/market-data/signals.js": "export const signal = 'hold';\n", "tests/trading.test.js": "import 'node:test';\n" } }],
  ["ai-agent-app", { dependencies: { openai: "^6.0.0" }, files: { "src/agents/tool.js": "export const tool = true;\n", "tests/agent.test.js": "import 'node:test';\n" } }],
  ["ai-app", { dependencies: { "@langchain/core": "^1.0.0" }, files: { "src/prompts/chat.js": "export const prompt = 'hi';\n", "tests/ai.test.js": "import 'node:test';\n" } }],
  ["llm-agent-platform", { files: { "agents/manifest.json": "[]\n", "tools/index.js": "export const tools = [];\n", "tests/platform.test.js": "import 'node:test';\n" } }],
  ["payments-system", { dependencies: { stripe: "^19.0.0" }, files: { "src/webhooks/stripe.js": "export const webhook = true;\n", "tests/payments.test.js": "import 'node:test';\n" } }],
  ["healthcare-app", { files: { "src/phi/access.js": "export const hipaa = true;\n", "tests/health.test.js": "import 'node:test';\n" } }],
  ["fintech-app", { files: { "src/kyc/risk.js": "export const money = true;\n", "tests/fintech.test.js": "import 'node:test';\n" } }],
  ["infrastructure", { files: { "infra/main.tf": "resource \"null_resource\" \"fixture\" {}\n", "tests/infra.test.js": "import 'node:test';\n" } }]
];

export function createBenchmarkCorpusProof(options = {}) {
  const root = options.root || process.cwd();
  const corpusRoot = options.corpusRoot || createFixtureCorpus(root);
  const paths = fs.readdirSync(corpusRoot).sort().map((item) => path.relative(root, path.join(corpusRoot, item)));
  const previousAllowed = process.env.SAGE_PROFILE_ALLOWED_ROOTS;
  const previousSecurity = process.env.SAGE_SECURITY_ALLOWED_ROOTS;
  const previousReview = process.env.SAGE_REVIEW_ALLOWED_ROOTS;
  process.env.SAGE_PROFILE_ALLOWED_ROOTS = [previousAllowed, corpusRoot].filter(Boolean).join(path.delimiter);
  process.env.SAGE_SECURITY_ALLOWED_ROOTS = [previousSecurity, corpusRoot].filter(Boolean).join(path.delimiter);
  process.env.SAGE_REVIEW_ALLOWED_ROOTS = [previousReview, corpusRoot].filter(Boolean).join(path.delimiter);
  try {
    const matrix = createBenchmarkMatrixReport({
      root,
      paths,
      risk: "high",
      save: options.save !== false,
      compare: Boolean(options.compare),
      failOnRegression: Boolean(options.failOnRegression)
    });
    const profileCoverage = new Set(matrix.results.map((result) => result.profile));
    const report = {
      type: "benchmark-corpus-proof",
      status: matrix.status === "passed" && matrix.summary.count >= 20 && profileCoverage.size >= 12 ? "passed" : "failed",
      generatedAt: new Date().toISOString(),
      corpusRoot,
      minimumRepos: 20,
      profileCoverage: [...profileCoverage].sort(),
      matrix
    };
    writeEvidence(root, "benchmark-corpus-latest.json", report);
    return report;
  } finally {
    if (previousAllowed === undefined) delete process.env.SAGE_PROFILE_ALLOWED_ROOTS;
    else process.env.SAGE_PROFILE_ALLOWED_ROOTS = previousAllowed;
    if (previousSecurity === undefined) delete process.env.SAGE_SECURITY_ALLOWED_ROOTS;
    else process.env.SAGE_SECURITY_ALLOWED_ROOTS = previousSecurity;
    if (previousReview === undefined) delete process.env.SAGE_REVIEW_ALLOWED_ROOTS;
    else process.env.SAGE_REVIEW_ALLOWED_ROOTS = previousReview;
  }
}

function createFixtureCorpus(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-corpus-"));
  for (const [name, spec] of FIXTURES) {
    const project = path.join(dir, name);
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      scripts: { test: "node --test", ...(spec.scripts || {}) },
      dependencies: spec.dependencies || {},
      devDependencies: spec.devDependencies || {}
    }, null, 2));
    fs.writeFileSync(path.join(project, "README.md"), `# ${name}\n`);
    for (const [file, content] of Object.entries(spec.files || {})) {
      fs.mkdirSync(path.dirname(path.join(project, file)), { recursive: true });
      fs.writeFileSync(path.join(project, file), content);
    }
  }
  return dir;
}

function writeEvidence(root, file, report) {
  const target = path.join(root, ".sage-kernel/evidence", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
}
