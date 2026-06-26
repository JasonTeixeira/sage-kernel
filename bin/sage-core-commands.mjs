/* node:coverage disable */
import path from "node:path";
import { help, printTool, runNode, runNpm, root } from "./sage-runtime.mjs";
import { runSupervisor, supervisorStatus, stopDaemon } from "../packages/operate/daemon.mjs";

export async function handleCoreCommand(command, args) {
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      help();
      return true;

    case "status":
      runNpm("phase:status");
      return true;

    case "tools":
      runNpm("mcp:tools");
      return true;

    case "ask": {
      const query = args.join(" ");
      if (!query) {
        console.error("Usage: sage ask <query>");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", [
        "kernel.catalog.search",
        JSON.stringify({ query, limit: 10 })
      ]);
      return true;
    }

    case "templates":
      runNpm("template:list");
      return true;

    case "plan": {
      const [template, target = "vercel", ...nameParts] = args;
      if (!template) {
        console.error("Usage: sage plan <template> [target] [name]");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", [
        "kernel.project.plan",
        JSON.stringify({ template, target, name: nameParts.join(" ") || undefined })
      ]);
      return true;
    }

    case "new": {
      const [template, ...nameParts] = args;
      const name = nameParts.join(" ");
      if (!template || !name) {
        console.error("Usage: sage new <template> <name>");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", [
        "kernel.project.scaffold",
        JSON.stringify({ template, name })
      ]);
      return true;
    }

    case "infra": {
      const [template, target = "vercel"] = args;
      if (!template) {
        console.error("Usage: sage infra <template> [target]");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", [
        "kernel.infra.plan",
        JSON.stringify({ template, target })
      ]);
      return true;
    }

    case "emit": {
      const [template, target = "docker-compose", name = template] = args;
      if (!template) {
        console.error("Usage: sage emit <template> <target> [name]");
        process.exit(1);
      }
      runNpm("infra:emit", ["--template", template, "--target", target, "--name", name]);
      return true;
    }

    case "qa": {
      const [value = "next-saas-app"] = args;
      if (value.includes("/") || value === ".") {
        runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.run", JSON.stringify({ projectPath: value })]);
      } else {
        runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.qa.plan", JSON.stringify({ template: value })]);
      }
      return true;
    }

    case "repo": {
      const [repo] = args;
      if (!repo) {
        console.error("Usage: sage repo <repo-name>");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.repo.inspect", JSON.stringify({ repo })]);
      return true;
    }

    case "deploy": {
      const [template, target = "vercel"] = args;
      if (!template) {
        console.error("Usage: sage deploy <template> [target]");
        process.exit(1);
      }
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.deploy.prepare", JSON.stringify({ template, target })]);
      return true;
    }

    case "jobs":
      runNpm("jobs:list");
      return true;

    case "run": {
      const [job] = args;
      if (!job) {
        console.error("Usage: sage run <job-id>");
        process.exit(1);
      }
      runNpm("jobs:run", [job]);
      return true;
    }

    case "enqueue": {
      const [job] = args;
      if (!job) {
        console.error("Usage: sage enqueue <job-id>");
        process.exit(1);
      }
      runNpm("jobs:enqueue", [job]);
      return true;
    }

    case "tick":
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.worker.tick", "{}"]);
      return true;

    case "daemon": {
      const sub = args[0] || "start";
      const heartbeatPath = path.join(root, ".sage-kernel/daemon/heartbeat.json");
      if (sub === "status") {
        console.log(JSON.stringify(supervisorStatus(heartbeatPath), null, 2));
        return true;
      }
      if (sub === "stop") {
        console.log(JSON.stringify(stopDaemon({ root }), null, 2));
        return true;
      }
      const controller = new AbortController();
      process.on("SIGINT", () => controller.abort());
      process.on("SIGTERM", () => controller.abort());
      console.log("Sage daemon supervisor: worker child + heartbeat + restart-on-crash. Ctrl+C to stop.");
      const result = await runSupervisor({
        root,
        signal: controller.signal,
        maxRestarts: Number(process.env.SAGE_DAEMON_MAX_RESTARTS || 50)
      });
      console.log(JSON.stringify(result, null, 2));
      return true;
    }

    case "approvals": {
      const [status] = args;
      runNode("apps/mcp-server/scripts/call-tool.mjs", ["kernel.approvals.list", JSON.stringify({ status })]);
      return true;
    }

    case "runs":
      runNpm("jobs:runs");
      return true;

    case "dashboard":
      runNpm("dashboard:build");
      return true;

    case "dashboard-live":
      runNpm("dashboard:serve");
      return true;

    case "postgres-schema":
      runNpm("db:postgres:schema");
      return true;

    case "dogfood-prod":
      runNpm("dogfood:prod", args);
      return true;

    case "db":
      runNpm("db:summary");
      return true;

    case "daily":
      await printTool("kernel.workflow.daily_summary", {});
      return true;

    case "audit":
      await printTool("kernel.workflow.audit_repo", { projectPath: args[0] || ".", mode: args[1] || "fast" });
      return true;

    case "full-qa":
      await printTool("kernel.workflow.run_full_qa", { projectPath: args[0] || ".", mode: args[1] || "standard" });
      return true;

    case "create-app": {
      const [template, name, out] = args;
      if (!template || !name) {
        console.error("Usage: sage create-app <template> <name> [out]");
        process.exit(1);
      }
      await printTool("kernel.workflow.create_app", { template, name, out });
      return true;
    }

    case "release":
      await printTool("kernel.workflow.release_readiness", { template: args[0] || "worker-service", target: args[1] || "docker" });
      return true;

    case "pending":
      await printTool("kernel.workflow.pending_approvals", { status: args[0] || "pending" });
      return true;

    case "stress":
      await printTool("kernel.workflow.stress_dashboard", { url: args[0] || "http://127.0.0.1:8787" });
      return true;

    default:
      return false;
  }
}
