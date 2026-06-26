#!/usr/bin/env node
// SAGE_AGENT_COMMAND adapter for the NON-Claude path: drives the OpenAI Codex CLI
// (`codex exec`) as the autonomous repair agent. Same contract as claude-agent.mjs
// (argv[2]=agentId, diagnosis via SAGE_DIAGNOSIS_JSON, edits the cwd, exit 0 on
// success). This is the artifact that proves the loop is model-agnostic against a
// real foreign model, not a stub.
import { spawnSync } from "node:child_process";

const agentId = process.argv[2] || "auto";
const raw = process.env.SAGE_DIAGNOSIS_JSON || process.argv.slice(3).join(" ");
let diagnosis;
try { diagnosis = JSON.parse(raw); } catch { diagnosis = { instruction: raw }; }

const location = diagnosis.primaryLocation ? `${diagnosis.primaryLocation.file}:${diagnosis.primaryLocation.line ?? "?"}` : "n/a";
const prompt = [
  `You are a "${agentId}" repair agent. Make the smallest correct change that fixes the failure, editing files as needed. Do not weaken or delete tests.`,
  `Category: ${diagnosis.category || "unknown"}`,
  `Location: ${location}`,
  `Instruction: ${diagnosis.instruction || "Fix the failing gate."}`,
  `Impacted files: ${(diagnosis.impactedFiles || []).join(", ") || "unknown"}`,
  `When done, stop. Do not ask questions.`
].join("\n");

const cwd = process.cwd();
const result = spawnSync(
  "codex",
  ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "-C", cwd, prompt],
  { cwd, encoding: "utf8", timeout: 590000, maxBuffer: 1024 * 1024 * 16 }
);
process.stdout.write((result.stdout || result.stderr || `${agentId} attempted a fix`).trim().slice(0, 300));
process.exit(result.status === 0 ? 0 : 1);
