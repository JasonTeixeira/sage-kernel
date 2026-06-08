#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFile), "..");
const [command, ...args] = process.argv.slice(2);

function runNode(script, scriptArgs = []) {
  const result = spawnSync("node", [script, ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

function runNpm(script, scriptArgs = []) {
  const result = spawnSync("npm", ["run", script, "--", ...scriptArgs], {
    cwd: root,
    stdio: "inherit"
  });
  process.exitCode = result.status ?? 1;
}

function help() {
  console.log(`Sage Kernel OS

Usage:
  sage status
  sage tools
  sage ask <query>
  sage templates
  sage plan <template> [target] [name]
  sage new <template> <name>
  sage infra <template> [target]
  sage emit <template> <target> [name]
  sage qa <template|projectPath>
  sage repo <repo-name>
  sage deploy <template> [target]
  sage jobs
  sage enqueue <job-id>
  sage run <job-id>
  sage runs
  sage dashboard
  sage doctor
  sage mcp
  sage db

Examples:
  sage plan next-saas-app vercel contractor-dispatch-os
  sage new next-ai-app ai-research-copilot
  sage run nightly-local-audit
`);
}

switch (command) {
  case undefined:
  case "help":
  case "--help":
  case "-h":
    help();
    break;

  case "status":
    runNpm("phase:status");
    break;

  case "tools":
    runNpm("mcp:tools");
    break;

  case "ask": {
    const query = args.join(" ");
    if (!query) {
      console.error("Usage: sage ask <query>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.catalog.search",
      JSON.stringify({ query, limit: 10 })
    ]);
    break;
  }

  case "templates":
    runNpm("template:list");
    break;

  case "plan": {
    const [template, target = "vercel", ...nameParts] = args;
    if (!template) {
      console.error("Usage: sage plan <template> [target] [name]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.project.plan",
      JSON.stringify({ template, target, name: nameParts.join(" ") || undefined })
    ]);
    break;
  }

  case "new": {
    const [template, ...nameParts] = args;
    const name = nameParts.join(" ");
    if (!template || !name) {
      console.error("Usage: sage new <template> <name>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.project.scaffold",
      JSON.stringify({ template, name })
    ]);
    break;
  }

  case "infra": {
    const [template, target = "vercel"] = args;
    if (!template) {
      console.error("Usage: sage infra <template> [target]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", [
      "kernel.infra.plan",
      JSON.stringify({ template, target })
    ]);
    break;
  }

  case "emit": {
    const [template, target = "docker-compose", name = template] = args;
    if (!template) {
      console.error("Usage: sage emit <template> <target> [name]");
      process.exit(1);
    }
    runNpm("infra:emit", ["--template", template, "--target", target, "--name", name]);
    break;
  }

  case "qa": {
    const [value = "next-saas-app"] = args;
    if (value.includes("/") || value === ".") {
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.run", JSON.stringify({ projectPath: value })]);
    } else {
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.plan", JSON.stringify({ template: value })]);
    }
    break;
  }

  case "repo": {
    const [repo] = args;
    if (!repo) {
      console.error("Usage: sage repo <repo-name>");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.repo.inspect", JSON.stringify({ repo })]);
    break;
  }

  case "deploy": {
    const [template, target = "vercel"] = args;
    if (!template) {
      console.error("Usage: sage deploy <template> [target]");
      process.exit(1);
    }
    runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.deploy.prepare", JSON.stringify({ template, target })]);
    break;
  }

  case "jobs":
    runNpm("jobs:list");
    break;

  case "run": {
    const [job] = args;
    if (!job) {
      console.error("Usage: sage run <job-id>");
      process.exit(1);
    }
    runNpm("jobs:run", [job]);
    break;
  }

  case "enqueue": {
    const [job] = args;
    if (!job) {
      console.error("Usage: sage enqueue <job-id>");
      process.exit(1);
    }
    runNpm("jobs:enqueue", [job]);
    break;
  }

  case "runs":
    runNpm("jobs:runs");
    break;

  case "dashboard":
    runNpm("dashboard:build");
    break;

  case "doctor":
    runNpm("db:init");
    if (process.exitCode) break;
    runNpm("catalog:validate");
    if (process.exitCode) break;
    runNpm("infra:validate");
    if (process.exitCode) break;
    runNpm("jobs:validate");
    if (process.exitCode) break;
    runNpm("mcp:validate");
    if (process.exitCode) break;
    runNpm("security:scan");
    break;

  case "db":
    runNpm("db:summary");
    break;

  case "mcp":
    runNpm("mcp:server");
    break;

  case "root":
    console.log(root);
    break;

  default:
    console.error(`Unknown command: ${command}`);
    help();
    process.exit(1);
}
