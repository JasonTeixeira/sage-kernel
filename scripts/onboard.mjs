#!/usr/bin/env node
// One-command onboarding: point the kernel at ANY repo and get a readable SDLC
// assessment in one step. Handles the allowed-roots gate for you (adds the target's
// parent), runs the READ-ONLY SDLC chain via the uniform envelope (never throws),
// and prints a human summary + the exact MCP wiring to make it permanent.
//
//   node scripts/onboard.mjs /path/to/your/repo
//   npm run onboard -- /path/to/your/repo
import fs from "node:fs";
import path from "node:path";
import { callKernelToolSafe } from "../apps/mcp-server/src/kernel-tools.mjs";

const CHAIN = [
  ["kernel.profile.gaps", { projectPath: "." }],
  ["kernel.loop.score", { projectPath: ".", risk: "high" }],
  ["kernel.review.quality_score", { projectPath: "." }],
  ["kernel.security.proof", { projectPath: "." }],
  ["kernel.done.generate", { projectPath: ".", risk: "high" }]
];

export async function onboardRepo(repoPath) {
  const abs = path.resolve(repoPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`not a directory: ${abs}`);
  // Allow this repo's parent so the path gate accepts it (no manual env needed).
  const parent = path.dirname(abs);
  const existing = process.env.SAGE_PROFILE_ALLOWED_ROOTS || "";
  process.env.SAGE_PROFILE_ALLOWED_ROOTS = existing ? `${existing}:${parent}` : parent;

  const out = { repo: abs, steps: [] };
  for (const [tool, input] of CHAIN) {
    const env = await callKernelToolSafe(abs, tool, input);
    out.steps.push({ tool, ok: env.ok, data: env.ok ? env.data : null, error: env.ok ? null : env.error });
  }
  const by = (t) => out.steps.find((s) => s.tool === t)?.data || {};
  const gaps = by("kernel.profile.gaps");
  out.summary = {
    profile: gaps.primaryProfile || null,
    confidence: gaps.confidence ?? null,
    loopScore: by("kernel.loop.score").score ?? null,
    reviewScore: by("kernel.review.quality_score").score ?? by("kernel.review.quality_score").report?.score ?? null,
    securityStatus: by("kernel.security.proof").status ?? null,
    topGaps: (gaps.missing || []).slice(0, 5),
    requiredChecks: (by("kernel.done.generate").requiredChecks || []).slice(0, 8)
  };
  return out;
}

function render(out) {
  const s = out.summary;
  const lines = [
    `\n📦 sage-kernel onboarding — ${out.repo}`,
    `   profile:        ${s.profile} (confidence ${s.confidence})`,
    `   loop score:     ${s.loopScore}/100`,
    `   review score:   ${s.reviewScore}/100`,
    `   security:       ${s.securityStatus}`,
    `   required checks:${s.requiredChecks.length ? " " + s.requiredChecks.join(", ") : " (none)"}`,
    s.topGaps.length ? `   top gaps:\n${s.topGaps.map((g) => `     - ${g}`).join("\n")}` : "   top gaps:        none detected",
    "",
    "To make this permanent in Claude Code / Cursor, add to your MCP config:",
    `   "env": { "SAGE_PROFILE_ALLOWED_ROOTS": "${path.dirname(out.repo)}" }`,
    "then call kernel.profile.gaps / kernel.loop.score with projectPath set to this repo.",
    ""
  ];
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const target = process.argv[2];
  if (!target) { console.error("usage: node scripts/onboard.mjs <repoPath>"); process.exit(2); }
  onboardRepo(target).then((out) => {
    console.log(render(out));
    const failed = out.steps.filter((s) => !s.ok);
    if (failed.length) console.error(`note: ${failed.length} step(s) returned errors: ${failed.map((f) => `${f.tool}(${f.error?.kind})`).join(", ")}`);
    process.exit(0);
  }).catch((e) => { console.error(`onboard failed: ${e.message}`); process.exit(1); });
}
