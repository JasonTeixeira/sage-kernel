import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(new URL("../scripts/hallucination-gate.mjs", import.meta.url));

// Regression for the arg-parse bug: with no --threshold, the first file argument
// was silently dropped, so the gate scanned only README (0 claims, vacuous pass).
test("the hallucination gate scans the EXPLICIT file argument (not a README fallback)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-hg-"));
  const report = path.join(dir, "report.md");
  fs.writeFileSync(report, "Done: the feature is complete and fully verified and shipped to production.\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# nothing to see\n");
  try {
    const r = spawnSync("node", [GATE, report], { cwd: dir, encoding: "utf8" });
    // It must have SCANNED report.md (found the unbacked success claim) -> exit 1,
    // not fallen back to the claim-free README -> exit 0.
    assert.notEqual(r.status, 0, `gate should fail on an unbacked claim in the given file; got exit ${r.status}\n${r.stdout}`);
    assert.match(r.stdout, /"totalClaims": [1-9]/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
