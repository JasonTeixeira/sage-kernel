import test from "node:test";
import assert from "node:assert/strict";
import { deployVerifyRollback } from "../packages/deploy/pipeline.mjs";
import { createLocalProvider } from "../packages/deploy/providers/local.mjs";
import { createVercelProvider, createSupabaseProvider } from "../packages/deploy/providers/cloud.mjs";

// Real verify: hit the deployed server's /health over HTTP.
async function httpVerify(handle) {
  try {
    const res = await fetch(new URL("/health", handle.baseUrl), { signal: AbortSignal.timeout(2000) });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

test("happy path: a healthy deploy verifies and is kept (real HTTP)", async () => {
  const provider = createLocalProvider();
  try {
    const result = await deployVerifyRollback({ provider, verify: httpVerify, version: { id: "v2", healthy: true }, previous: { id: "v1", healthy: true } });
    assert.equal(result.status, "deployed");
    const res = await fetch(new URL("/version", result.handle.baseUrl));
    assert.equal((await res.json()).version, "v2");
  } finally {
    await provider.shutdown();
  }
});

test("failure path: a bad deploy fails verify and is ROLLED BACK to the previous version", async () => {
  const provider = createLocalProvider();
  try {
    const result = await deployVerifyRollback({ provider, verify: httpVerify, version: { id: "v2", healthy: false }, previous: { id: "v1", healthy: true } });
    assert.equal(result.status, "rolled_back");
    assert.deepEqual(result.restored, { id: "v1", healthy: true });
    // The live server now serves the restored good version and is healthy again.
    assert.equal(provider.current().id, "v1");
    const res = await fetch(new URL("/health", result.rolledBack.baseUrl));
    assert.equal(res.ok, true);
    assert.equal((await res.json()).version, "v1");
  } finally {
    await provider.shutdown();
  }
});

test("no rollback available: a bad deploy with no previous reports failed_no_rollback (fail-closed)", async () => {
  const provider = createLocalProvider();
  try {
    const result = await deployVerifyRollback({ provider, verify: httpVerify, version: { id: "v1", healthy: false }, previous: null });
    assert.equal(result.status, "failed_no_rollback");
  } finally {
    await provider.shutdown();
  }
});

test("a verify that throws is treated as a failed verify (rollback, not crash)", async () => {
  const provider = createLocalProvider();
  try {
    const result = await deployVerifyRollback({ provider, verify: async () => { throw new Error("probe exploded"); }, version: { id: "v2", healthy: true }, previous: { id: "v1", healthy: true } });
    assert.equal(result.status, "rolled_back");
    assert.match(result.verdict.error, /probe exploded/);
  } finally {
    await provider.shutdown();
  }
});

test("pipeline guards its inputs", async () => {
  await assert.rejects(deployVerifyRollback({ verify: () => ({ ok: true }) }), /provider/);
  await assert.rejects(deployVerifyRollback({ provider: { deploy() {} } }), /verify/);
});

test("cloud adapters honestly block without credentials (no fake deploy)", async () => {
  const vercel = createVercelProvider({});
  const supabase = createSupabaseProvider({});
  assert.equal((await deployVerifyRollback({ provider: vercel, verify: async () => ({ ok: true }), version: { id: "v1" } })).status, "blocked_not_available");
  assert.equal((await deployVerifyRollback({ provider: supabase, verify: async () => ({ ok: true }), version: { id: "v1" } })).status, "blocked_not_available");
});
