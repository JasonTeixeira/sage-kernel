import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { embed, embeddingCosine, isEmbeddingConfigured } from "../packages/learning/embeddings.mjs";
import { recordFix, recallFix } from "../packages/learning/knowledge.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sage-embed-"));
const root = path.resolve(import.meta.dirname, "..");

test("embed returns null when unconfigured, vector when an embedder is injected", () => {
  assert.equal(isEmbeddingConfigured({}), false);
  assert.equal(embed("hi", {}), null);
  assert.deepEqual(embed("hi", { embedder: () => [1, 2, 3] }), [1, 2, 3]);
  // Provider envelope shapes are normalized.
  assert.deepEqual(embed("hi", { embedder: () => ({ embedding: [4, 5] }) }), [4, 5]);
  assert.deepEqual(embed("hi", { embedder: () => ({ data: [{ embedding: [6] }] }) }), [6]);
});

test("embed runs a configured command and parses its vector; null on failure", () => {
  const ok = embed("text", { command: "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log('[1,2,3]'))\"" });
  assert.deepEqual(ok, [1, 2, 3]);
  assert.equal(embed("text", { command: "node -e \"process.exit(1)\"" }), null);
  assert.equal(embed("text", { command: "node -e \"console.log('not json')\"" }), null);
});

test("embeddingCosine is bounded and 1 for identical vectors", () => {
  assert.equal(embeddingCosine([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(embeddingCosine([1, 0], [0, 1]), 0);
  assert.equal(embeddingCosine([1, 2, 3], []), 0);
});

test("recordFix stores an embedding and recallFix uses semantic mode", () => {
  const store = tmp();
  const embedder = (text) => (/auth|login|credential/i.test(text) ? [1, 0, 0] : [0, 1, 0]);
  recordFix({ signature: { category: "auth", message: "login failed" }, fix: "reset auth token" }, { root: store, embedder });
  const hit = recallFix({ category: "auth", message: "credential rejected" }, { root: store, embedder, threshold: 0.6 });
  assert.ok(hit);
  assert.equal(hit.mode, "semantic");
  assert.equal(hit.fix, "reset auth token");
});

test("recallFix falls back to lexical when no embedding is stored", () => {
  const store = tmp();
  recordFix({ signature: { category: "build", message: "type error TS2322" }, fix: "fix the type" }, { root: store });
  const hit = recallFix({ category: "build", message: "type error TS2322" }, { root: store, threshold: 0.5 });
  assert.ok(hit);
  assert.equal(hit.mode, "lexical");
});

test("embed-api adapter posts to an embedding API and prints the vector", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    // Async spawn (not spawnSync) so this process's event loop stays free to
    // serve the adapter's fetch — spawnSync would deadlock the in-process server.
    const out = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join("providers", "embed-api.mjs")], {
        cwd: root,
        env: { ...process.env, SAGE_EMBEDDING_API_URL: `http://127.0.0.1:${port}/embed` }
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr || `exit ${code}`))));
      child.stdin.end("embed me");
    });
    assert.deepEqual(JSON.parse(out), [0.1, 0.2, 0.3]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
