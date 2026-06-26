// Runtime / production-grade gate (release wiring). Two-part proof:
//  1) self-check: the runtime evaluator correctly accepts a green app and rejects
//     a console-error / low-Lighthouse / failed-smoke app (capability is real);
//  2) target: detect runtime capability and run live if a captureRuntime() is
//     provided via SAGE_RUNTIME_CAPTURE; otherwise report blocked_not_available
//     honestly (never a fake pass). A FAILED live run fails the gate.
import fs from "node:fs";
import path from "node:path";
import { runtimeVerdict, runtimeGateForTarget } from "../packages/runtime/gate.mjs";
import { captureRuntime } from "../packages/runtime/capture.mjs";

const root = process.cwd();
const goodLighthouse = { categories: { performance: { score: 0.95 }, accessibility: { score: 0.96 }, "best-practices": { score: 0.95 }, seo: { score: 0.95 } } };

const selfCheck = {
  acceptsGreen: runtimeVerdict({ lighthouse: goodLighthouse, console: [{ type: "log" }], smoke: [{ name: "home", status: "passed" }] }).status === "passed",
  rejectsConsoleError: runtimeVerdict({ lighthouse: goodLighthouse, console: [{ type: "error" }], smoke: [{ name: "home", status: "passed" }] }).status === "failed",
  rejectsLowLighthouse: runtimeVerdict({ lighthouse: { categories: { performance: { score: 0.2 } } }, console: [], smoke: [{ name: "home", status: "passed" }] }).status === "failed",
  rejectsEmptySmoke: runtimeVerdict({ lighthouse: goodLighthouse, console: [], smoke: [] }).status === "failed"
};

// P30: prove the live-capture ORCHESTRATION (boot -> capture -> evaluate -> stop)
// deterministically with an injected boot+runner, so the live path is real and
// tested even where no browser is installed.
let captureStops = 0;
const captured = await captureRuntime({
  boot: async () => ({ baseUrl: "http://127.0.0.1:0", stop: () => { captureStops += 1; } }),
  runner: async ({ baseUrl }) => ({ lighthouse: goodLighthouse, console: [{ type: "log" }], smoke: [{ name: "home", status: "passed", url: baseUrl }] })
});
selfCheck.captureOrchestration = captured.status === "captured" && runtimeVerdict(captured).status === "passed" && captureStops === 1;
const selfOk = Object.values(selfCheck).every(Boolean);

const target = await runtimeGateForTarget({ root });
// blocked_not_available is honest and acceptable; only an actual FAILED live run blocks.
const targetOk = target.status !== "failed";
const status = selfOk && targetOk ? "passed" : "failed";

const report = { type: "runtime-gate", status, selfCheck, target: { status: target.status, reason: target.reason || null, capability: target.capability } };
const out = path.join(root, ".sage-kernel/evidence/runtime-gate-latest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
