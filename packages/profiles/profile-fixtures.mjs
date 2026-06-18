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
      name: "fastapi-service",
      files: {
        "pyproject.toml": "[project]\ndependencies = ['fastapi']\n",
        "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
        "tests/test_app.py": "def test_ok(): assert True\n"
      },
      expected: "backend-api"
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
