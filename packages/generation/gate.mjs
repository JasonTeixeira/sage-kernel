// Generation gate (P29). Generated code is NEVER trusted: this runs the same
// security/structure engines the loop uses over the generated file set and only
// ACCEPTS it when there are zero high-severity findings and every code file
// parses. On reject it writes nothing — generation never leaves half-applied debt
// in the target.

import fs from "node:fs";
import path from "node:path";
import { scanSastFile } from "../security/sast.mjs";
import { scanPolyglotFile } from "../security/polyglot-sast.mjs";
import { safeParse } from "../ast/parse.mjs";

const JS_CODE = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts)$/;
const POLY_CODE = /\.(py|swift)$/;

export function proveGenerated(files = [], options = {}) {
  const findings = [];
  const unparseable = [];
  for (const file of files) {
    if (JS_CODE.test(file.path)) {
      for (const f of scanSastFile(file.path, file.content)) findings.push(f);
      if (!/\.(ts|tsx|mts|cts)$/.test(file.path) && safeParse(file.content) === null) unparseable.push(file.path);
    } else if (POLY_CODE.test(file.path)) {
      for (const f of scanPolyglotFile(file.path, file.content)) findings.push(f);
    }
  }
  const high = findings.filter((f) => f.severity === "high" || f.severity === "critical");
  const accepted = high.length === 0 && unparseable.length === 0;
  return {
    accepted,
    fileCount: files.length,
    high: high.length,
    unparseable,
    findings,
    reason: accepted ? null : high.length ? "high-severity finding in generated code" : "generated code does not parse"
  };
}

// Accept-or-discard write: only persists files to the target when the gate passes.
export function commitGeneratedIfProven(files, targetRoot, options = {}) {
  const verdict = proveGenerated(files, options);
  if (!verdict.accepted) return { ...verdict, written: [] };
  const written = [];
  for (const file of files) {
    const target = path.join(targetRoot, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
    written.push(file.path);
  }
  return { ...verdict, written };
}
