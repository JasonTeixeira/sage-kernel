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
  },
  {
    name: "sage.plan-my-day",
    title: "Plan My Day",
    description: "Create a daily engineering plan from current project state, runbooks, evals, and gates.",
    argsSchema: {
      objective: z.string().optional().describe("Primary objective for the day.")
    },
    render: ({ objective = "advance the project safely" }) => `Plan my engineering day to ${objective}.

Use Sage Kernel project state, runbooks, latest eval report, pending approvals, and release gates. Return:
- today's objective
- 3-5 concrete steps
- risks
- verification commands
- evidence that must be collected before calling the work complete.`
  },
  {
    name: "sage.project-standup",
    title: "Project Standup",
    description: "Summarize current project status as a standup update.",
    argsSchema: {
      focus: z.string().optional().describe("Subsystem or goal to focus on.")
    },
    render: ({ focus = "current repo" }) => `Run a project standup for ${focus}.

Summarize:
- completed work
- current state
- blockers
- risks
- pending approvals
- next verification commands.

Use durable state and actual command evidence wherever available.`
  },
  {
    name: "sage.execute-release-runbook",
    title: "Execute Release Runbook",
    description: "Walk through the release runbook with explicit verification and approval boundaries.",
    argsSchema: {
      runbook: z.string().optional().describe("Runbook id.")
    },
    render: ({ runbook = "runbook_daily_release_readiness" }) => `Execute the ${runbook} release runbook.

Do not skip steps. For every step, record:
- command or inspection performed
- result
- evidence path or output summary
- whether approval is required before continuing.

Stop on any failed verification and report the smallest fix.`
  },
  {
    name: "sage.explain-current-risk",
    title: "Explain Current Risk",
    description: "Explain current project risk from evals, coverage, approvals, memory, and release state.",
    argsSchema: {
      scope: z.string().optional().describe("Risk scope.")
    },
    render: ({ scope = "current project" }) => `Explain current risk for ${scope}.

Prioritize hard blockers first, then operational risks. Ground the answer in:
- latest eval report
- coverage and test gates
- pending approvals
- dashboard health
- git working tree
- release readiness.

End with the next command that reduces the highest risk.`
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
