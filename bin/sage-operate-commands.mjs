/* node:coverage disable */
import { runOperate } from "../packages/operate/operate.mjs";
import { runGuard } from "../packages/operate/guard.mjs";
import { installGitHooks } from "../packages/operate/hooks.mjs";
import { routeTask } from "../packages/agents/router.mjs";
import { listLoops } from "../packages/loops/registry.mjs";
import { selectLoop, recordLoopOverride } from "../packages/loops/selector.mjs";
import { runLoop } from "../packages/loops/run-loop.mjs";
import { analyzeDeadCode } from "../packages/refactor/dead-code.mjs";
import { createTaskContract } from "../packages/contracts/task-contract.mjs";
import { classifyRepoDiff, changedFiles } from "../packages/risk/diff-classifier.mjs";
import { mapTestImpact } from "../packages/testing/impact-map.mjs";

function arg(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(`--${name}`);
}

function collectCriteria(args) {
  return args.reduce((acc, value, index) => (value === "--ac" && args[index + 1] ? [...acc, args[index + 1]] : acc), []);
}

function out(value) {
  console.log(JSON.stringify(value, null, 2));
}

export async function handleOperateCommand(command, args = []) {
  const root = process.cwd();

  if (command === "operate") {
    const goal = arg(args, "goal");
    if (!goal) {
      console.error('Usage: sage operate --goal "..." [--ac "criterion" ...] [--approve]');
      process.exit(1);
    }
    const report = await runOperate({
      root,
      goal,
      acceptanceCriteria: collectCriteria(args),
      approve: flag(args, "approve")
    });
    out(report);
    process.exit(report.status === "passed" ? 0 : 1);
  }

  if (command === "contract" && args[0] === "create") {
    const goal = arg(args, "goal") || "";
    out(createTaskContract({ root, goal, acceptanceCriteria: collectCriteria(args) }));
    return true;
  }

  if (command === "risk" && args[0] === "diff") {
    out(classifyRepoDiff({ root }));
    return true;
  }

  if (command === "impact") {
    out(mapTestImpact(changedFiles(root), { root, requireCoverage: flag(args, "strict") }));
    return true;
  }

  if (command === "route") {
    out(routeTask({ root, goal: arg(args, "goal") || "", files: changedFiles(root) }));
    return true;
  }

  if (command === "guard") {
    const report = await runGuard({ root });
    out(report);
    process.exit(report.status === "passed" ? 0 : 1);
  }

  if (command === "install-hooks") {
    out(installGitHooks({ root }));
    return true;
  }

  if (command === "dead-code") {
    const result = analyzeDeadCode(root, { strict: flag(args, "strict") });
    out(result);
    process.exit(result.status === "passed" ? 0 : 1);
  }

  if (command === "loops") {
    const sub = args[0];
    if (sub === "list" || !sub) {
      out(listLoops());
      return true;
    }
    if (sub === "select") {
      out(selectLoop({ root, goal: arg(args, "goal") || "", loop: arg(args, "loop") }));
      return true;
    }
    if (sub === "learn") {
      const loop = arg(args, "loop");
      if (!loop) {
        console.error("Usage: sage loops learn --loop=<id> [--reason=...]");
        process.exit(1);
      }
      out({ override: recordLoopOverride({ root, loop, reason: arg(args, "reason") }) });
      return true;
    }
    if (sub === "run") {
      const report = await runLoop({ root, goal: arg(args, "goal") || "", loop: arg(args, "loop"), approve: flag(args, "approve") });
      out(report);
      process.exit(report.status === "passed" ? 0 : 1);
    }
    console.error("Usage: sage loops <list|select|learn|run> [--goal=...] [--loop=...]");
    process.exit(1);
  }

  return false;
}
