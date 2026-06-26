#!/usr/bin/env node
// SAGE_MODEL_RUBRIC_COMMAND adapter — uses the local Claude Code CLI as the
// model grader. Reads {rubric, minimumScore} on stdin (the eval-runner
// contract) and prints {score, evidence} JSON on stdout. Exit 0 on success.
import { spawnSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try {
  payload = JSON.parse(input || "{}");
} catch {
  payload = {};
}
const rubric = Array.isArray(payload.rubric) ? payload.rubric : [];
const prompt = [
  "You are a strict, skeptical grader. Score 0-100 how fully the work satisfies EVERY rubric item.",
  'Respond ONLY with compact JSON: {"score": <0-100 integer>, "evidence": "<one sentence>"}.',
  "Rubric:",
  ...rubric.map((item, index) => `${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`)
].join("\n");

const result = spawnSync("claude", ["-p", prompt, "--output-format", "json"], {
  encoding: "utf8",
  timeout: 170000,
  maxBuffer: 1024 * 1024 * 8
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "claude grader failed");
  process.exit(1);
}

let text = result.stdout || "";
try {
  const envelope = JSON.parse(text);
  text = envelope.result ?? envelope.text ?? text;
} catch {
  /* not an envelope; treat stdout as the answer text */
}
let parsed;
try {
  parsed = JSON.parse(extractJson(text));
} catch {
  parsed = { score: 0, evidence: "grader output could not be parsed" };
}
console.log(JSON.stringify({ score: Math.round(Number(parsed.score || 0)), evidence: parsed.evidence || null }));

function extractJson(value) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end >= start ? value.slice(start, end + 1) : value;
}
