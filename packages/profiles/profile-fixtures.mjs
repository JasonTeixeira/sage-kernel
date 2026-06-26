export function createProfileProofFixtures() {
  return [
    {
      name: "next-web",
      files: {
        "package.json": JSON.stringify({ name: "next-web", dependencies: { next: "latest", react: "latest" }, scripts: { test: "node --test", build: "next build" } }),
        "next.config.js": "module.exports = {}\n",
        "tests/app.test.js": "test('ok', () => {})\n"
      },
      expected: "web-app"
    },
    {
      name: "next-saas",
      files: {
        "package.json": JSON.stringify({ name: "next-saas", dependencies: { next: "latest", react: "latest", stripe: "latest", "next-auth": "latest" }, scripts: { test: "node --test" } }),
        "app/api/billing/route.ts": "export function POST() {}\n",
        "tests/billing.test.js": "test('ok', () => {})\n"
      },
      expected: "payments-system"
    },
    {
      name: "tenant-saas",
      files: {
        "package.json": JSON.stringify({ name: "tenant-saas", dependencies: { next: "latest", react: "latest", "next-auth": "latest" }, scripts: { test: "node --test" } }),
        "app/api/tenant/route.ts": "export function GET() {}\n",
        "app/auth/page.tsx": "export default function Auth() { return null; }\n",
        "tests/tenant.test.js": "test('ok', () => {})\n"
      },
      expected: "saas-app"
    },
    {
      name: "admin-dashboard",
      files: {
        "package.json": JSON.stringify({ name: "admin-dashboard", dependencies: { react: "latest", vite: "latest" }, scripts: { test: "node --test", "dashboard:e2e": "node test.mjs" } }),
        "src/admin/index.tsx": "export const Admin = () => null;\n",
        "tests/admin.test.js": "test('ok', () => {})\n"
      },
      expected: "admin-dashboard"
    },
    {
      name: "browser-extension",
      files: {
        "package.json": JSON.stringify({ name: "browser-extension", scripts: { test: "node --test" } }),
        "manifest.json": JSON.stringify({ manifest_version: 3, permissions: [] }),
        "content-script.js": "console.log('ok')\n",
        "tests/extension.test.js": "test('ok', () => {})\n"
      },
      expected: "browser-extension"
    },
    {
      name: "fastapi-service",
      files: {
        "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
        "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "tests/test_app.py": "def test_ok(): assert True\n"
      },
      expected: "backend-api"
    },
    {
      name: "worker-service",
      files: {
        "package.json": JSON.stringify({ name: "worker-service", scripts: { test: "node --test", "worker:run": "node workers/run.mjs" } }),
        "workers/run.mjs": "console.log('work')\n",
        "tests/worker.test.js": "test('ok', () => {})\n"
      },
      expected: "worker-service"
    },
    {
      name: "mcp-tool",
      files: {
        "package.json": JSON.stringify({ name: "mcp-tool", dependencies: { "@modelcontextprotocol/sdk": "latest" }, scripts: { "mcp:smoke": "node smoke.mjs" } }),
        "apps/mcp-server/tools.json": JSON.stringify({ tools: [] })
      },
      expected: "mcp-server"
    },
    {
      name: "expo-mobile",
      files: {
        "package.json": JSON.stringify({ name: "expo-mobile", dependencies: { expo: "latest", "react-native": "latest" }, scripts: { test: "node --test" } }),
        "app.json": "{}\n",
        "tests/app.test.js": "test('ok', () => {})\n"
      },
      expected: "mobile-app"
    },
    {
      name: "node-cli",
      files: {
        "package.json": JSON.stringify({ name: "node-cli", bin: { "node-cli": "bin/cli.mjs" }, scripts: { test: "node --test" } }),
        "bin/cli.mjs": "#!/usr/bin/env node\nconsole.log('ok')\n",
        "tests/cli.test.js": "test('ok', () => {})\n"
      },
      expected: "cli-tool"
    },
    {
      name: "node-library",
      files: {
        "package.json": JSON.stringify({ name: "node-library", exports: "./src/index.js", scripts: { test: "node --test" } }),
        "src/index.js": "export const ok = true;\n",
        "tests/index.test.js": "test('ok', () => {})\n"
      },
      expected: "library"
    },
    {
      name: "etl-pipeline",
      files: {
        "pipelines/load.py": "print('load')\n",
        "datasets/sample.json": "{}\n",
        "tests/test_pipeline.py": "def test_ok(): assert True\n"
      },
      expected: "data-pipeline"
    },
    {
      name: "dbt-warehouse",
      files: {
        "dbt_project.yml": "name: warehouse\n",
        "models/orders.sql": "select 1 as id\n",
        "tests/test_models.py": "def test_ok(): assert True\n"
      },
      expected: "data-warehouse-dbt"
    },
    {
      name: "trading-system",
      files: {
        "package.json": JSON.stringify({ name: "trading-system", scripts: { test: "node --test" } }),
        "src/signals/risk-engine.js": "export const risk = true;\n",
        "tests/risk.test.js": "test('ok', () => {})\n"
      },
      expected: "trading-system"
    },
    {
      name: "agent-app",
      files: {
        "package.json": JSON.stringify({ name: "agent-app", dependencies: { openai: "latest" }, scripts: { test: "node --test", "eval:run": "node evals/run.mjs" } }),
        "agents/reviewer.md": "Review code.\n",
        "evals/run.mjs": "console.log('eval')\n",
        "tests/agent.test.js": "test('ok', () => {})\n"
      },
      expected: "ai-agent-app"
    },
    {
      name: "ai-app",
      files: {
        "package.json": JSON.stringify({ name: "ai-app", dependencies: { openai: "latest" }, scripts: { test: "node --test" } }),
        "src/prompts/chat.ts": "export const prompt = 'answer safely';\n",
        "tests/ai.test.js": "test('ok', () => {})\n"
      },
      expected: "ai-app"
    },
    {
      name: "llm-agent-platform",
      files: {
        "package.json": JSON.stringify({ name: "llm-agent-platform", dependencies: { openai: "latest" }, scripts: { test: "node --test", "agents:eval": "node evals/run.mjs" } }),
        "agents/builder.md": "Build safely.\n",
        "memory/policy.md": "Memory policy.\n",
        "tools/manifest.json": "{}\n",
        "tests/platform.test.js": "test('ok', () => {})\n"
      },
      expected: "llm-agent-platform"
    },
    {
      name: "healthcare-app",
      files: {
        "package.json": JSON.stringify({ name: "healthcare-app", scripts: { test: "node --test" } }),
        "src/patient/phi-boundary.js": "export const phi = true;\n",
        "tests/phi.test.js": "test('ok', () => {})\n"
      },
      expected: "healthcare-app"
    },
    {
      name: "fintech-app",
      files: {
        "package.json": JSON.stringify({ name: "fintech-app", scripts: { test: "node --test" } }),
        "src/ledger/money-movement.js": "export const ledger = true;\n",
        "tests/ledger.test.js": "test('ok', () => {})\n"
      },
      expected: "fintech-app"
    },
    {
      name: "infra-stack",
      files: {
        "package.json": JSON.stringify({ name: "infra-stack", scripts: { test: "node --test" } }),
        "Dockerfile": "FROM node:22\n",
        "infra/main.tf": "terraform {}\n",
        "tests/infra.test.js": "test('ok', () => {})\n"
      },
      expected: "infrastructure"
    },
    {
      name: "electron-desktop",
      files: {
        "package.json": JSON.stringify({ name: "electron-desktop", dependencies: { electron: "latest", react: "latest" }, scripts: { test: "node --test" } }),
        "src/main.ts": "import { app } from 'electron';\n",
        "tests/window.test.js": "test('ok', () => {})\n"
      },
      expected: "desktop-app"
    },
    {
      name: "astro-site",
      files: {
        "package.json": JSON.stringify({ name: "astro-site", dependencies: { astro: "latest" }, scripts: { build: "astro build", test: "node --test" } }),
        "astro.config.mjs": "export default {}\n",
        "src/pages/index.astro": "<h1>Hi</h1>\n",
        "tests/site.test.js": "test('ok', () => {})\n"
      },
      expected: "static-site"
    },
    {
      name: "phaser-game",
      files: {
        "package.json": JSON.stringify({ name: "phaser-game", dependencies: { phaser: "latest" }, scripts: { test: "node --test" } }),
        "src/scenes/main.js": "export class Main {}\n",
        "tests/game.test.js": "test('ok', () => {})\n"
      },
      expected: "game"
    },
    {
      name: "ml-training",
      files: {
        "requirements.txt": "torch==2.3.0\nscikit-learn\n",
        "train.py": "import torch\n",
        "tests/test_train.py": "def test_ok(): assert True\n"
      },
      expected: "ml-training"
    },
    {
      name: "solidity-contracts",
      files: {
        "package.json": JSON.stringify({ name: "solidity-contracts", devDependencies: { hardhat: "latest" }, scripts: { test: "node --test" } }),
        "hardhat.config.js": "module.exports = {}\n",
        "contracts/Token.sol": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Token {}\n",
        "tests/token.test.js": "test('ok', () => {})\n"
      },
      expected: "smart-contract"
    },
    {
      name: "workspace-monorepo",
      files: {
        "package.json": JSON.stringify({ name: "workspace-monorepo", workspaces: ["packages/*"], scripts: { test: "node --test" } }),
        "packages/a/package.json": JSON.stringify({ name: "a" }),
        "tests/workspace.test.js": "test('ok', () => {})\n"
      },
      expected: "monorepo"
    }
  ];
}
