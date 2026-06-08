import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { callKernelTool, toMcpTextContent } from "./kernel-tools.mjs";

const root = process.cwd();

export function createServer() {
  const server = new McpServer({
    name: "sage-kernel",
    version: "0.1.0"
  });

  function register(name, description, inputSchema) {
    server.registerTool(name, { description, inputSchema }, async (input) => {
      const result = await callKernelTool(root, name, input);
      return toMcpTextContent(result);
    });
  }

  register("kernel.phase.status", "List kernel phase status.", z.object({}));
  register(
    "kernel.catalog.search",
    "Search repos, modules, templates, integrations, and phases.",
    z.object({
      query: z.string(),
      limit: z.number().optional()
    })
  );
  register("kernel.template.list", "List available project templates.", z.object({}));
  register(
    "kernel.project.plan",
    "Create a project plan from a template, QA profile, and infra target.",
    z.object({
      template: z.string(),
      target: z.string().optional(),
      name: z.string().optional()
    })
  );
  register(
    "kernel.project.scaffold",
    "Scaffold a local project skeleton from a kernel template.",
    z.object({
      template: z.string(),
      name: z.string(),
      out: z.string().optional()
    })
  );
  register("kernel.warehouse.summary", "Summarize AI Warehouse inventory.", z.object({}));
  register(
    "kernel.warehouse.search",
    "Search the AI Warehouse index for tools, categories, tags, and verdicts.",
    z.object({ query: z.string(), limit: z.number().optional(), verdict: z.string().optional() })
  );
  register(
    "kernel.qa.profile",
    "Return the QA profile for a template.",
    z.object({
      template: z.string()
    })
  );
  register(
    "kernel.qa.plan",
    "Plan QA gates for a template without executing them.",
    z.object({ template: z.string(), mode: z.string().optional() })
  );
  register(
    "kernel.qa.run",
    "Run safe local QA for the kernel or a generated project.",
    z.object({ projectPath: z.string().optional(), mode: z.string().optional() })
  );
  register(
    "kernel.repo.inspect",
    "Inspect a cataloged source repo without mutating it.",
    z.object({ repo: z.string() })
  );
  register(
    "kernel.infra.plan",
    "Return an infrastructure plan for a template and deploy target.",
    z.object({
      template: z.string(),
      target: z.string().optional()
    })
  );
  register(
    "kernel.deploy.prepare",
    "Prepare a deploy readiness plan with QA, infra, env, rollback, and approval gates.",
    z.object({ template: z.string(), target: z.string().optional() })
  );
  register("kernel.jobs.list", "List local safe jobs and approval boundaries.", z.object({}));
  register(
    "kernel.jobs.run",
    "Run a local safe job and write run history.",
    z.object({
      job: z.string()
    })
  );
  register(
    "kernel.jobs.runs",
    "List recent local job runs.",
    z.object({
      limit: z.number().optional()
    })
  );
  register(
    "kernel.jobs.enqueue",
    "Enqueue a durable local job in SQLite.",
    z.object({ job: z.string(), payload: z.object({}).passthrough().optional() })
  );
  register("kernel.worker.tick", "Run one durable worker queue tick.", z.object({}));
  register(
    "kernel.approvals.request",
    "Record an approval request in the local ledger.",
    z.object({ action: z.string(), reason: z.string(), payload: z.object({}).passthrough().optional() })
  );
  register(
    "kernel.approvals.list",
    "List approval ledger entries.",
    z.object({ status: z.string().optional() })
  );
  register("kernel.dashboard.snapshot", "Return DB-backed dashboard snapshot.", z.object({}));
  register(
    "kernel.dogfood.prod",
    "Audit three production repos against kernel QA readiness.",
    z.object({ repos: z.array(z.string()).optional() })
  );

  return server;
}

export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
