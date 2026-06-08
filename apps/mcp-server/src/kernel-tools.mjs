import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function runNode(root, script, args = []) {
  const result = spawnSync("node", [script, ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Command failed: ${script}`);
  }
  return result.stdout.trim();
}

function searchCatalog(root, query, limit = 20) {
  const q = query.toLowerCase();
  const files = [
    ["repos", "catalog/repos.json", "repos"],
    ["modules", "catalog/modules.json", "modules"],
    ["templates", "catalog/templates.json", "templates"],
    ["integrations", "catalog/integrations.json", "integrations"],
    ["phases", "catalog/phases.json", "phases"]
  ];

  const results = [];
  for (const [kind, file, key] of files) {
    const data = readJson(root, file);
    for (const item of data[key]) {
      const text = JSON.stringify(item).toLowerCase();
      if (text.includes(q)) {
        results.push({ kind, item });
      }
    }
  }

  return results.slice(0, limit);
}

function getQaProfile(root, templateId) {
  const templates = readJson(root, "catalog/templates.json").templates;
  const profiles = readJson(root, "packages/qa/profiles.json").profiles;
  const template = templates.find((item) => item.id === templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  const profile = profiles.find((item) => item.id === template.qaProfile);
  if (!profile) throw new Error(`Missing QA profile: ${template.qaProfile}`);
  return { template, profile };
}

function infraPlan(root, templateId, target = "vercel") {
  const output = runNode(root, "packages/infra/scripts/infra-plan.mjs", [
    "--template",
    templateId,
    "--target",
    target
  ]);
  return JSON.parse(output);
}

function listRuns(root, limit = 20) {
  const dir = path.join(root, ".sage-kernel", "runs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((file) => {
      const run = readJson(root, path.join(".sage-kernel", "runs", file));
      return {
        runId: run.runId,
        jobId: run.jobId,
        status: run.status,
        durationMs: run.durationMs,
        finishedAt: run.finishedAt
      };
    });
}

export async function callKernelTool(root, toolName, input = {}) {
  switch (toolName) {
    case "kernel.phase.status":
      return readJson(root, "catalog/phases.json").phases;

    case "kernel.catalog.search":
      if (!input.query) throw new Error("kernel.catalog.search requires input.query");
      return searchCatalog(root, input.query, input.limit ?? 20);

    case "kernel.template.list":
      return readJson(root, "catalog/templates.json").templates;

    case "kernel.project.plan": {
      if (!input.template) throw new Error("kernel.project.plan requires input.template");
      const { template, profile } = getQaProfile(root, input.template);
      return {
        name: input.name ?? null,
        template,
        qaProfile: profile,
        infraPlan: infraPlan(root, input.template, input.target ?? "vercel")
      };
    }

    case "kernel.project.scaffold": {
      if (!input.template || !input.name) {
        throw new Error("kernel.project.scaffold requires input.template and input.name");
      }
      const args = ["--template", input.template, "--name", input.name];
      if (input.out) args.push("--out", input.out);
      return {
        output: runNode(root, "packages/templates/scripts/template-scaffold.mjs", args)
      };
    }

    case "kernel.warehouse.summary":
      return JSON.parse(runNode(root, "packages/ai-warehouse/scripts/warehouse-summary.mjs"));

    case "kernel.qa.profile":
      if (!input.template) throw new Error("kernel.qa.profile requires input.template");
      return getQaProfile(root, input.template);

    case "kernel.infra.plan":
      if (!input.template) throw new Error("kernel.infra.plan requires input.template");
      return infraPlan(root, input.template, input.target ?? "vercel");

    case "kernel.jobs.list":
      return readJson(root, "apps/worker/jobs.json").jobs;

    case "kernel.jobs.run": {
      if (!input.job) throw new Error("kernel.jobs.run requires input.job");
      const output = runNode(root, "apps/worker/scripts/jobs-run.mjs", [input.job]);
      return JSON.parse(output);
    }

    case "kernel.jobs.runs":
      return listRuns(root, input.limit ?? 20);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function toMcpTextContent(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
