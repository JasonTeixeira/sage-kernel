#!/usr/bin/env node
// Model-AGNOSTIC repair adapter (P12). Proves the agent interface is not
// Claude-shaped: it shells WHATEVER model CLI is configured via SAGE_MODEL_CLI
// (default "claude"), using the standard `-p <prompt> --permission-mode acceptEdits`
// convention. Point SAGE_MODEL_CLI at any prompt-taking coding CLI (cursor-agent,
// a local model wrapper, etc.) and the autonomy loop works unchanged. Diagnosis
// arrives via SAGE_DIAGNOSIS_JSON (shell-safe); argv[2] is the agent id.
import { spawnSync } from "node:child_process";

const cli = process.env.SAGE_MODEL_CLI || "claude";
const agentId = process.argv[2] || "auto";
let diagnosis;
try { diagnosis = JSON.parse(process.env.SAGE_DIAGNOSIS_JSON || "{}"); } catch { diagnosis = {}; }

const location = diagnosis.primaryLocation ? `${diagnosis.primaryLocation.file}:${diagnosis.primaryLocation.line ?? "?"}` : "n/a";
const prompt = [
  `You are a "${agentId}" repair agent. Make the smallest correct change that fixes the failure; do not weaken tests.`,
  `Category: ${diagnosis.category || "unknown"}`,
  `Location: ${location}`,
  `Instruction: ${diagnosis.instruction || "Fix the failing gate."}`,
  `Impacted files: ${(diagnosis.impactedFiles || []).join(", ") || "unknown"}`
].join("\n");

const result = spawnSync(cli, ["-p", prompt, "--permission-mode", "acceptEdits"], { stdio: "inherit", timeout: 600000 });
process.exit(result.status === 0 ? 0 : 1);
