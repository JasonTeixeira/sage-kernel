// Deploy gate (P31). Proves the deploy->verify->rollback loop both ways with the
// real local provider (real HTTP): a healthy deploy is kept; a bad deploy fails
// verification and is rolled back to the previous good version (fail-closed).
import fs from "node:fs";
import path from "node:path";
import { deployVerifyRollback } from "../packages/deploy/pipeline.mjs";
import { createLocalProvider } from "../packages/deploy/providers/local.mjs";

const root = process.cwd();

async function httpVerify(handle) {
  try {
    const res = await fetch(new URL("/health", handle.baseUrl), { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

const provider = createLocalProvider();
let happy;
let rollback;
try {
  happy = await deployVerifyRollback({ provider, verify: httpVerify, version: { id: "v2", healthy: true }, previous: { id: "v1", healthy: true } });
  rollback = await deployVerifyRollback({ provider, verify: httpVerify, version: { id: "v3", healthy: false }, previous: { id: "v2", healthy: true } });
} finally {
  await provider.shutdown();
}

const status = happy.status === "deployed" && rollback.status === "rolled_back" && rollback.restored?.id === "v2" ? "passed" : "failed";
const report = {
  type: "deploy-proof",
  status,
  happyPath: happy.status,
  failurePath: rollback.status,
  restoredTo: rollback.restored?.id || null,
  generatedAt: new Date().toISOString()
};
const target = path.join(root, ".sage-kernel/evidence/deploy-proof-latest.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify(report, null, 2));
process.exit(status === "passed" ? 0 : 1);
