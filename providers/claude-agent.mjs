#!/usr/bin/env node
// SAGE_AGENT_COMMAND adapter — uses the local Claude Code CLI as the autonomous
// repair agent. Invoked as `<cmd> <agentId> <diagnosisJSON>` (executor.mjs).
// Edits files in the working directory to fix the diagnosed failure. Exit 0 on
// success; stdout is a short human-readable summary.
//
// The diagnosis arrives via SAGE_DIAGNOSIS_JSON (shell-safe, lossless). We fall
// back to rejoining argv[3..] for older callers, then to a plain instruction.
import { spawnSync } from "node:child_process";

const agentId = process.argv[2] || "auto";
const raw = process.env.SAGE_DIAGNOSIS_JSON || process.argv.slice(3).join(" ");
let diagnosis;
try {
  diagnosis = JSON.parse(raw);
} catch {
  diagnosis = { instruction: raw };
}

const location = diagnosis.primaryLocation ? `${diagnosis.primaryLocation.file}:${diagnosis.primaryLocation.line ?? "?"}` : "n/a";
const prompt = [
  `You are a "${agentId}" repair agent. Make the smallest correct change that fixes the failure, editing files as needed. Do not weaken tests.`,
  `Category: ${diagnosis.category || "unknown"}`,
  `Location: ${location}`,
  `Instruction: ${diagnosis.instruction || "Fix the failing gate."}`,
  `Impacted files: ${(diagnosis.impactedFiles || []).join(", ") || "unknown"}`
].join("\n");

const result = spawnSync("claude", ["-p", prompt, "--permission-mode", "acceptEdits"], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 590000,
  maxBuffer: 1024 * 1024 * 16
});
process.stdout.write((result.stdout || result.stderr || `${agentId} attempted a fix`).trim().slice(0, 300));
process.exit(result.status === 0 ? 0 : 1);
