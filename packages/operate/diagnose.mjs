// Diagnosis layer — turns a failing gate's output into a localized, classified
// root cause plus a targeted repair instruction. Pure and deterministic, so the
// autonomous repairer aims a fix instead of retrying blindly.

import path from "node:path";

const CATEGORY_RULES = [
  { category: "syntax", pattern: /SyntaxError|Unexpected (token|identifier|end of input)/i },
  { category: "reference", pattern: /Cannot find (module|package)|ERR_MODULE_NOT_FOUND|is not defined|is not a function|has no exported member/i },
  { category: "type", pattern: /TypeError|is not assignable|Type '.*' is/i },
  { category: "assertion", pattern: /AssertionError|assert(?:ion)?\b|Expected .* (to|values)/i },
  { category: "filesystem", pattern: /ENOENT|EACCES|EPERM|no such file/i },
  { category: "timeout", pattern: /timed? ?out|ETIMEDOUT|exceeded .* timeout/i },
  { category: "network", pattern: /ECONNREFUSED|ENOTFOUND|fetch failed|network/i }
];

function classify(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return "unknown";
}

function normalizeFile(file, root) {
  if (!root) return file;
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs);
  return rel.startsWith("..") ? file : rel;
}

function extractLocations(text, root) {
  const locations = [];
  const seen = new Set();
  const re = /([A-Za-z0-9_.\-/]+\.(?:mjs|cjs|js|ts|tsx|jsx)):(\d+)(?::(\d+))?/g;
  for (const match of text.matchAll(re)) {
    const file = match[1];
    if (/node:internal|node_modules/.test(file)) continue;
    const norm = normalizeFile(file, root);
    const key = `${norm}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ file: norm, line: Number(match[2]), column: match[3] ? Number(match[3]) : null });
  }
  return locations;
}

function firstErrorLine(text) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return (
    lines.find((line) => /(Error|AssertionError|Expected|not ok|FAIL|✖)/.test(line)) ||
    lines[0] ||
    "Unknown failure"
  );
}

function buildInstruction(category, message, primary, command) {
  const where = primary ? ` at ${primary.file}:${primary.line}` : "";
  const base = {
    assertion: `An assertion failed${where}. Fix the implementation so the asserted behavior holds (do not weaken the test).`,
    reference: `A missing/undefined reference${where}. Add or correct the import/export or define the missing symbol.`,
    syntax: `A syntax error${where}. Correct the syntax.`,
    type: `A type error${where}. Fix the type mismatch.`,
    filesystem: `A filesystem error${where}. Ensure required files/paths exist or fix the path.`,
    timeout: `A timeout${where}. Reduce the work or fix the hang; do not just raise the timeout.`,
    network: `A network failure${where}. Use a real/local endpoint or guard the call.`,
    unknown: `A failure${where}. Investigate the error and apply the smallest correct fix.`
  };
  return `${base[category] || base.unknown} Root error: ${message}. Command: ${command || "n/a"}.`;
}

export function diagnoseFailure(options = {}) {
  const root = options.root;
  const command = options.command || null;
  const text = `${options.stdout || ""}\n${options.stderr || ""}`.trim();
  const category = classify(text);
  const locations = extractLocations(text, root);
  const primaryLocation = locations[0] || null;
  const message = firstErrorLine(text);
  return {
    category,
    message,
    primaryLocation,
    impactedFiles: [...new Set(locations.map((loc) => loc.file))],
    instruction: buildInstruction(category, message, primaryLocation, command),
    command
  };
}
