#!/usr/bin/env node
// SAGE_VERIFIER_COMMAND adapter — uses the local Claude Code CLI as an
// adversarial verifier. The claim arrives via SAGE_VERIFY_CLAIM (shell-safe);
// argv[2] is the verifier index. Each index gets a distinct skeptical lens.
// Reply must LEAD with CONFIRMED or REFUTED (verify.mjs parses strictly); exit 0.
import { spawnSync } from "node:child_process";

const index = process.argv[2] || "0";
const raw = process.env.SAGE_VERIFY_CLAIM || process.argv.slice(3).join(" ");
let claim = raw;
try {
  const parsed = JSON.parse(raw);
  claim = typeof parsed === "string" ? parsed : parsed.claim || raw;
} catch {
  /* raw is already the claim */
}

const lenses = ["correctness", "does-it-actually-hold-under-edge-cases", "is-the-evidence-real"];
const lens = lenses[Number(index) % lenses.length];
const prompt = `You are skeptical verifier #${index} using the "${lens}" lens. Default to REFUTED if uncertain. Reply with exactly CONFIRMED or REFUTED followed by one sentence of why. Claim: ${claim}`;

const result = spawnSync("claude", ["-p", prompt], {
  encoding: "utf8",
  timeout: 110000,
  maxBuffer: 1024 * 1024 * 8
});
process.stdout.write((result.stdout || "").trim().slice(0, 200));
process.exit(result.status === 0 ? 0 : 1);
