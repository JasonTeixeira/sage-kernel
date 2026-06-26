#!/usr/bin/env node
// Deep production-readiness audit: does this MCP server actually run the SDLC on
// FOREIGN projects (not the kernel, not fixtures)? Runs the READ-ONLY SDLC analysis
// chain against each given real repo via the same dispatch a client uses, and
// checks: (a) every tool returns without error, (b) results are non-trivial, and
// (c) scores DIFFER across repos (proving real per-project analysis, not canned
// output). It NEVER calls mutating tools (operate.run etc.) — your code is untouched.
// Also audits doc accuracy: every kernel.* tool referenced in the docs must exist.
//
//   node scripts/audit-foreign-sdlc.mjs /path/repoA /path/repoB ...
import fs from "node:fs";
import path from "node:path";
import { callKernelTool } from "../apps/mcp-server/src/kernel-tools.mjs";
import manifest from "../apps/mcp-server/tools.json" with { type: "json" };

const root = process.cwd();
const repos = process.argv.slice(2).filter((a) => !a.startsWith("--") && fs.existsSync(a));

// READ-ONLY SDLC chain (no mutation of the target repo).
const CHAIN = [
  ["kernel.profile.gaps", { projectPath: "." }, (r) => `profile=${r.primaryProfile} confidence=${r.confidence}`],
  ["kernel.done.generate", { projectPath: ".", risk: "high" }, (r) => `checks=${(r.requiredChecks || []).length}`],
  ["kernel.loop.score", { projectPath: ".", risk: "high" }, (r) => `status=${r.status} score=${r.score}`],
  ["kernel.review.quality_score", { projectPath: "." }, (r) => `status=${r.status || r.report?.status} score=${r.score ?? r.report?.score}`],
  ["kernel.security.proof", { projectPath: "." }, (r) => `status=${r.status}`],
  ["kernel.testing.strategy", { projectPath: ".", risk: "high" }, (r) => `status=${r.status || "generated"}`]
];

function docAccuracy() {
  const real = new Set(manifest.tools.map((t) => t.name));
  const files = ["CLAUDE.md", "AGENTS.md", ...(() => { try { return fs.readdirSync(path.join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`); } catch { return []; } })()];
  const bad = [];
  for (const f of files) {
    let txt; try { txt = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    // Ignore audit/gap docs that intentionally name desired-but-absent tools.
    if (/GAP_AUDIT|PROGRAM_/.test(f)) continue;
    for (const ref of new Set([...txt.matchAll(/kernel\.[a-z_]+\.[a-z0-9_]+/g)].map((x) => x[0]))) {
      if (!real.has(ref)) bad.push({ file: f, ref });
    }
  }
  return bad;
}

const results = [];
for (const repo of repos) {
  const name = path.basename(repo);
  const row = { repo: name, tools: [], errors: 0 };
  for (const [tool, input, summarize] of CHAIN) {
    try {
      const r = await callKernelTool(repo, tool, input);
      row.tools.push({ tool, ok: true, summary: summarize(r), score: r.score ?? r.report?.score ?? null });
    } catch (e) {
      row.tools.push({ tool, ok: false, error: String(e.message).slice(0, 160) });
      row.errors += 1;
    }
  }
  results.push(row);
  console.error(`${name}: ${row.tools.filter((t) => t.ok).length}/${CHAIN.length} tools OK${row.errors ? ` (${row.errors} errors)` : ""}`);
}

// Checks
const docBad = docAccuracy();
const allToolsOk = results.every((r) => r.errors === 0);
// loop.score must differ across repos (real per-project analysis, not canned).
const loopScores = results.map((r) => r.tools.find((t) => t.tool === "kernel.loop.score")?.score).filter((s) => s != null);
const scoresDiffer = new Set(loopScores).size > 1;

const report = {
  type: "foreign-sdlc-audit",
  repos: results.length,
  allToolsOk,
  docAccuracyClean: docBad.length === 0,
  docViolations: docBad,
  scoresDiffer,
  loopScores,
  results,
  generatedAt: new Date().toISOString()
};
const dir = path.join(root, ".sage-kernel/autonomy");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "foreign-sdlc-audit-latest.json"), `${JSON.stringify(report, null, 2)}\n`);

const pass = allToolsOk && report.docAccuracyClean && scoresDiffer && results.length >= 3;
console.error(`\nforeign SDLC audit: ${pass ? "PASS" : "FAIL"} — toolsOk=${allToolsOk} docClean=${report.docAccuracyClean} scoresDiffer=${scoresDiffer} (${loopScores.join(",")})`);
if (docBad.length) console.error(`doc violations: ${docBad.map((b) => `${b.file}:${b.ref}`).join(", ")}`);
console.log(JSON.stringify({ pass, allToolsOk, docAccuracyClean: report.docAccuracyClean, scoresDiffer, loopScores }));
process.exit(pass ? 0 : 1);
