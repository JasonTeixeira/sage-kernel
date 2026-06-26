// Factual grounding — extends hallucination detection beyond "unbacked success
// claim" to "factually contradicts the repo": references to files/modules that
// do not exist in the provided repo facts are flagged as ungrounded. Pure and
// dependency-free.

import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", ".sage-kernel", "generated", "dist", "build", "coverage"]);

export function repoFiles(root = process.cwd()) {
  const out = new Set();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.add(path.relative(root, full));
    }
  };
  walk(root);
  return out;
}

// Flag file/module references in text that do not exist in the known fact set.
export function groundClaims(text, facts = {}) {
  const files = facts.files instanceof Set ? facts.files : new Set(facts.files || []);
  const references = [
    ...new Set([...String(text ?? "").matchAll(/[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:mjs|cjs|js|ts|tsx|jsx|json|md)/g)].map((m) => m[0]))
  ];
  const ungrounded = references.filter((ref) => {
    const norm = ref.replace(/^\.\//, "");
    return !files.has(ref) && !files.has(norm) && ![...files].some((file) => file.endsWith(`/${norm}`) || file === norm);
  });
  return {
    status: ungrounded.length === 0 ? "grounded" : "ungrounded",
    references,
    ungrounded,
    checkedAgainst: files.size
  };
}

export function groundClaimsAgainstRepo(text, root = process.cwd()) {
  return groundClaims(text, { files: repoFiles(root) });
}
