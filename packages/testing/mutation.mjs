// Mutation testing — proves the tests actually catch bugs. It introduces small
// faults (mutants) into a target file and checks whether the tests fail (kill
// the mutant). A surviving mutant means the tests pass even with a planted bug,
// which lowers the mutation score. The target file is always restored.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeParse, walkAst } from "../ast/parse.mjs";

// Token-level mutators. Each represents a class of fault: condition flips,
// boolean flips, and logical-operator flips.
export const MUTATORS = [
  { id: "strict-eq", token: "===", to: "!==", description: "=== to !==" },
  { id: "strict-neq", token: "!==", to: "===", description: "!== to ===" },
  { id: "logical-and", token: "&&", to: "||", description: "&& to ||" },
  { id: "logical-or", token: "||", to: "&&", description: "|| to &&" },
  { id: "gte", token: ">=", to: "<", description: ">= to <" },
  { id: "lte", token: "<=", to: ">", description: "<= to >" },
  { id: "bool-true", token: "true", to: "false", description: "true to false", word: true },
  { id: "bool-false", token: "false", to: "true", description: "false to true", word: true }
];

function isWordChar(ch) {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

export function generateMutants(source, options = {}) {
  const mutators = options.mutators || MUTATORS;
  const max = options.maxMutants || 30;
  const mutants = [];
  for (const mutator of mutators) {
    let from = 0;
    while (mutants.length < max) {
      const index = source.indexOf(mutator.token, from);
      if (index < 0) break;
      from = index + mutator.token.length;
      if (mutator.word) {
        const before = source[index - 1];
        const after = source[index + mutator.token.length];
        if (isWordChar(before) || isWordChar(after)) continue; // skip substring matches
      }
      const mutated = source.slice(0, index) + mutator.to + source.slice(index + mutator.token.length);
      mutants.push({ id: `${mutator.id}@${index}`, mutator: mutator.id, description: mutator.description, index, mutated });
    }
  }
  return mutants.slice(0, max);
}

// AST semantic mutators — faults a token scan cannot express: negated returns,
// flipped conditionals, dropped awaits, arithmetic swaps, and removed statements.
// Each mutant is a single splice into the ORIGINAL source (independent mutants).
export function generateSemanticMutants(source, options = {}) {
  const ast = safeParse(source);
  if (!ast) return [];
  const max = options.maxMutants || 30;
  const mutants = [];
  const text = (node) => source.slice(node.start, node.end);
  const splice = (node, replacement, id, description) => {
    if (mutants.length >= max) return;
    mutants.push({
      id: `${id}@${node.start}`,
      mutator: id,
      description,
      index: node.start,
      mutated: source.slice(0, node.start) + replacement + source.slice(node.end)
    });
  };
  walkAst(ast, {
    ReturnStatement(node) {
      if (node.argument) splice(node.argument, `!(${text(node.argument)})`, "negate-return", "negate return value");
    },
    IfStatement(node) {
      splice(node.test, `!(${text(node.test)})`, "flip-if", "negate if condition");
    },
    AwaitExpression(node) {
      splice(node, text(node.argument), "drop-await", "remove await");
    },
    ExpressionStatement(node) {
      // Removing a side-effecting statement should be caught by a real test.
      if (node.expression?.type === "CallExpression") splice(node, ";", "remove-stmt", "remove statement");
    },
    BinaryExpression(node) {
      if (node.operator === "+" || node.operator === "-") {
        const to = node.operator === "+" ? "-" : "+";
        const opStart = source.indexOf(node.operator, node.left.end);
        if (opStart >= 0 && opStart < node.right.start && mutants.length < max) {
          mutants.push({
            id: `arith@${opStart}`,
            mutator: "arith-swap",
            description: `${node.operator} to ${to}`,
            index: opStart,
            mutated: source.slice(0, opStart) + to + source.slice(opStart + 1)
          });
        }
      }
    }
  });
  return mutants.slice(0, max);
}

// Combined mutant set: token mutators plus AST semantic mutators (unless disabled).
export function generateAllMutants(source, options = {}) {
  const token = generateMutants(source, options);
  const semantic = options.semantic === false ? [] : generateSemanticMutants(source, options);
  return [...token, ...semantic].slice(0, options.maxMutants || 60);
}

// Spawn a clean child test process. The env is sanitized so a parent test runner
// does not coordinate with (and skew the exit code of) this child run.
function cleanTestEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_TEST")) delete env[key];
  }
  return env;
}

function runTests(root, testFiles) {
  const result = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: root,
    encoding: "utf8",
    timeout: 600000,
    env: cleanTestEnv()
  });
  return { status: result.status === 0 ? "passed" : "failed", exitCode: result.status ?? 1 };
}

// Run mutation testing against a target file. The target is ALWAYS restored, even
// on error. A mutant is "killed" when the tests fail with the mutant in place.
export async function runMutationTesting(options = {}) {
  const root = options.root || process.cwd();
  const targetFile = options.targetFile;
  const testFiles = options.testFiles || [];
  if (!targetFile) throw new Error("runMutationTesting requires options.targetFile");
  if (testFiles.length === 0) throw new Error("runMutationTesting requires options.testFiles");

  const fullPath = path.join(root, targetFile);
  const original = fs.readFileSync(fullPath, "utf8");
  const mutants = options.mutants || generateAllMutants(original, options);
  const threshold = options.threshold ?? 80;
  const results = [];

  try {
    for (const mutant of mutants) {
      fs.writeFileSync(fullPath, mutant.mutated);
      const outcome = options.runner ? await options.runner({ root, testFiles, mutant }) : runTests(root, testFiles);
      results.push({ id: mutant.id, description: mutant.description, killed: outcome.status !== "passed" });
    }
  } finally {
    fs.writeFileSync(fullPath, original);
  }

  const total = results.length;
  const killed = results.filter((entry) => entry.killed).length;
  const survived = results.filter((entry) => !entry.killed);
  const mutationScore = total > 0 ? Math.round((100 * killed) / total) : 100;

  return {
    status: total === 0 ? "skipped" : mutationScore >= threshold ? "passed" : "failed",
    targetFile,
    testFiles,
    mutationScore,
    threshold,
    total,
    killed,
    survived: survived.map((entry) => ({ id: entry.id, description: entry.description })),
    restored: fs.readFileSync(fullPath, "utf8") === original
  };
}
