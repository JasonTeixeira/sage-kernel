// Model-backed evaluation — real pass@1 / pass@k / pass^k from stochastic model
// samples, plus a hallucination rate per sample. Provider-gated: without a
// configured model grader command it honestly returns blocked_not_implemented
// (never fabricates a passing eval). Injectable grader for deterministic tests.

export function isModelGraderConfigured(env = process.env) {
  return Boolean(env.SAGE_MODEL_RUBRIC_COMMAND && String(env.SAGE_MODEL_RUBRIC_COMMAND).trim());
}

function commandGrader(command) {
  if (!command || !String(command).trim()) return null;
  return async ({ task, sample }) => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(command, [String(sample), JSON.stringify(task)], { encoding: "utf8", timeout: 300000, shell: true });
    const out = String(result.stdout || "");
    return {
      passed: result.status === 0 && /\b(pass|passed|true|correct)\b/i.test(out) && !/\bfail(ed)?\b/i.test(out),
      hallucinated: /hallucinat|unsupported|fabricat/i.test(out),
      raw: out.trim().slice(0, 200)
    };
  };
}

export async function runModelRubric(options = {}) {
  const samples = options.samples ?? 3;
  const grade = options.grader || commandGrader(options.command || process.env.SAGE_MODEL_RUBRIC_COMMAND);
  if (!grade) {
    return { status: "blocked_not_implemented", reason: "no model grader configured (set SAGE_MODEL_RUBRIC_COMMAND or inject grader)" };
  }
  const results = [];
  for (let sample = 0; sample < samples; sample += 1) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await grade({ task: options.task, sample }));
  }
  const passes = results.filter((result) => result.passed).length;
  const hallucinated = results.filter((result) => result.hallucinated).length;
  return {
    status: "passed",
    samples,
    passes,
    passAt1: results[0]?.passed ? 1 : 0,
    passAtK: passes > 0 ? 1 : 0,
    passPowerK: passes === samples ? 1 : 0,
    hallucinationRate: samples ? Number((hallucinated / samples).toFixed(4)) : 0,
    results
  };
}
