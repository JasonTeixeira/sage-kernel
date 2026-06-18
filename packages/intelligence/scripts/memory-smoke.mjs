import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryStore } from "../memory-store.mjs";
import { createProjectState } from "../project-state.mjs";

export function runMemorySmoke(options = {}) {
  const root = options.root || fs.mkdtempSync(path.join(os.tmpdir(), "sage-memory-smoke-"));
  const schemaRoot = options.schemaRoot || path.resolve(import.meta.dirname, "../../..");
  if (!fs.existsSync(path.join(root, "package.json"))) {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "memory-smoke", version: "1.0.0" }));
  }
  const storeFactory = options.createStore || createMemoryStore;
  const stateFactory = options.createState || createProjectState;
  const store = storeFactory({ root, schemaRoot });
  const record = store.write({
    id: "mem_memory_smoke",
    projectId: "memory-smoke",
    kind: "fact",
    source: "test",
    actor: "memory-smoke",
    confidence: 1,
    observedAt: "2026-06-17T00:00:00.000Z",
    content: { summary: "Memory smoke record", tags: ["smoke"] },
    provenance: { evidenceType: "command", evidenceRef: "npm run memory:smoke" }
  });
  const search = store.search({ query: "smoke" });
  const audit = store.audit();
  const state = stateFactory({ root, schemaRoot });

  return {
    status: record.id === "mem_memory_smoke" && search.length === 1 && audit.total === 1 && state.memory.total === 1 ? "passed" : "failed",
    record,
    searchCount: search.length,
    audit,
    state: { status: state.status, memoryTotal: state.memory.total }
  };
}

export function runMemorySmokeCli(options = {}) {
  const result = runMemorySmoke(options);
  const stdout = options.stdout || console.log;
  stdout(JSON.stringify(result, null, 2));
  return result.status === "passed" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runMemorySmokeCli());
}
