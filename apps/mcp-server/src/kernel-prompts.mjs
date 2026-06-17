import { z } from "zod";

export const kernelPrompts = [
  {
    name: "sage.audit-repo",
    title: "Audit Repository",
    description: "Audit a repository for production readiness, security, tests, docs, and release risk.",
    argsSchema: {
      scope: z.string().optional().describe("Repo, path, or subsystem to audit.")
    },
    render: ({ scope = "current repo" }) => `Audit ${scope} using Sage Kernel.

Required evidence:
- npm run qa:gate
- npm test
- npm run test:coverage
- npm run security:scan
- npm audit
- git diff --check

Report blockers first, then high-value fixes, evidence checked, missing evidence, and the next concrete action.`
  },
  {
    name: "sage.run-full-qa",
    title: "Run Full QA",
    description: "Run the full local QA and verification gate sequence.",
    argsSchema: {
      mode: z.string().optional().describe("fast, standard, or deep.")
    },
    render: ({ mode = "standard" }) => `Run Sage Kernel QA in ${mode} mode.

Execute the relevant validation, test, coverage, security, and release-pack commands. Do not claim success unless each command passes or a failure is clearly documented.`
  },
  {
    name: "sage.create-project",
    title: "Create Project",
    description: "Plan a new production-ready project from a Sage template.",
    argsSchema: {
      template: z.string().optional().describe("Template id such as next-ai-app or worker-service."),
      name: z.string().optional().describe("Project name.")
    },
    render: ({ template = "next-ai-app", name = "new-project" }) => `Create a production-ready project plan for ${name} using the ${template} Sage template.

Include QA profile, infra target, env requirements, files to generate, verification commands, and release-readiness checks.`
  },
  {
    name: "sage.inspect-approvals",
    title: "Inspect Approvals",
    description: "Review pending approvals and explain which risky actions are waiting.",
    argsSchema: {
      status: z.string().optional().describe("Approval status filter.")
    },
    render: ({ status = "pending" }) => `Inspect ${status} Sage Kernel approvals.

Use the approval ledger to summarize action, reason, payload scope, age, signature state, and whether the approval should be granted, denied, or left pending.`
  },
  {
    name: "sage.prepare-release",
    title: "Prepare Release",
    description: "Prepare a release checklist and verify release readiness.",
    argsSchema: {
      version: z.string().optional().describe("Release version or tag.")
    },
    render: ({ version = "next" }) => `Prepare the Sage Kernel ${version} release.

Verify tests, coverage, MCP contracts, security scan, npm audit, stress harnesses, release pack, changelog, docs, and rollback notes.`
  },
  {
    name: "sage.stress-test-server",
    title: "Stress Test Server",
    description: "Run local stress tests against queue and dashboard endpoints.",
    argsSchema: {
      url: z.string().optional().describe("Dashboard base URL.")
    },
    render: ({ url = "http://127.0.0.1:8787" }) => `Stress test Sage Kernel.

Run:
- npm run stress:queue -- --count=1000
- npm run stress:dashboard -- --url=${url} --count=200 --concurrency=20
- npm run stress:dashboard -- --url=${url} --endpoint=/health --count=200 --concurrency=20

Report failures, throughput, p95 latency, and whether the server is acceptable for daily use.`
  },
  {
    name: "sage.explain-failed-job",
    title: "Explain Failed Job",
    description: "Explain a failed job run and propose a repair plan.",
    argsSchema: {
      runId: z.string().optional().describe("Run id to inspect.")
    },
    render: ({ runId = "latest failed run" }) => `Explain Sage Kernel job failure for ${runId}.

Inspect run history, job definition, step outputs, approval state, retry/dead-letter behavior, and propose the smallest safe fix with verification commands.`
  }
];

export function registerKernelPrompts(server) {
  for (const prompt of kernelPrompts) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: prompt.argsSchema
      },
      async (args) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: prompt.render(args || {})
            }
          }
        ]
      })
    );
  }
}
