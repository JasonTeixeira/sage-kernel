// Full-SDLC capstone gate (P33). Proves the whole arc composes: idea -> proven.
//   1) a clean run reaches deploy with every stage passed;
//   2) a defect injected at generation STOPS before deploy (fail-closed).
import fs from "node:fs";
import path from "node:path";
import { runSdlcE2e } from "../packages/sdlc/e2e.mjs";

const root = process.cwd();
const clean = await runSdlcE2e({ idea: "stripe webhook handler", profile: "payments-system" });
const defended = await runSdlcE2e({ idea: "stripe webhook handler", profile: "payments-system", injectDefect: true });

// A stage is acceptable if it passed OR honestly reported not-applicable
// (blocked_not_available — e.g. runtime on a code-only fixture with no app).
const cleanOk = clean.status === "passed" &&
  clean.stages.every((s) => s.status === "passed" || s.status === "blocked_not_available") &&
  clean.stages.some((s) => s.stage === "deploy" && s.status === "passed");
const defendedOk = defended.status === "stopped_before_deploy" && !defended.stages.some((s) => s.stage === "deploy");
const status = cleanOk && defendedOk ? "passed" : "failed";

const report = {
  type: "sdlc-e2e",
  status,
  clean: { status: clean.status, score: clean.score, stages: clean.stages.map((s) => `${s.stage}:${s.status}`) },
  defended: { status: defended.status, stoppedAt: defended.stoppedAt },
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/sdlc-e2e-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
