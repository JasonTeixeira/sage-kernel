import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { toOtlpPayload, exportOtlp, startOtlpReceiver, newTraceId, newSpanId } from "../packages/observability/otlp.mjs";
import { createObservabilityProof } from "../packages/observability/proof.mjs";

const root = path.resolve(import.meta.dirname, "..");

function sampleSpans() {
  const traceId = newTraceId();
  return [
    { traceId, spanId: newSpanId(), name: "a", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z", attributes: { proofId: "proof_x", status: "passed" } },
    { traceId, spanId: newSpanId(), name: "b", startedAt: "2026-01-01T00:00:01.000Z", finishedAt: "2026-01-01T00:00:02.000Z", attributes: { proofId: "proof_x", status: "passed" } }
  ];
}

test("toOtlpPayload produces real OTLP resourceSpans with proofId attributes", () => {
  const payload = toOtlpPayload(sampleSpans(), { serviceName: "sage-kernel" });
  const spans = payload.resourceSpans[0].scopeSpans[0].spans;
  assert.equal(spans.length, 2);
  assert.equal(payload.resourceSpans[0].resource.attributes[0].value.stringValue, "sage-kernel");
  assert.match(spans[0].traceId, /^[0-9a-f]{32}$/);
  assert.match(spans[0].spanId, /^[0-9a-f]{16}$/);
  assert.ok(/^[0-9]+$/.test(spans[0].startTimeUnixNano));
  assert.ok(spans[0].attributes.some((a) => a.key === "proofId" && a.value.stringValue === "proof_x"));
});

test("exportOtlp is honestly not_configured without an endpoint", async () => {
  const result = await exportOtlp(sampleSpans(), {});
  assert.equal(result.exported, false);
  assert.equal(result.status, "not_configured");
});

test("exportOtlp posts real OTLP to a local receiver and the spans arrive with proofId", async () => {
  const receiver = await startOtlpReceiver();
  try {
    const result = await exportOtlp(sampleSpans(), { endpoint: receiver.url });
    assert.equal(result.exported, true);
    assert.equal(result.status, "exported");
    assert.equal(result.spansSent, 2);
    const received = receiver.spans();
    assert.equal(received.length, 2);
    assert.ok(received.some((s) => s.attributes.some((a) => a.key === "proofId" && a.value.stringValue === "proof_x")));
  } finally {
    await receiver.close();
  }
});

test("createObservabilityProof exports to a real OTLP endpoint and links spans to a proofId", async () => {
  const receiver = await startOtlpReceiver();
  try {
    const report = await createObservabilityProof({ root, save: false, otlpEndpoint: receiver.url, proofId: "proof_obs_test" });
    assert.equal(report.otlp.exported, true);
    assert.equal(report.otlp.status, "exported");
    assert.ok(report.spans.every((s) => s.attributes.proofId === "proof_obs_test"));
    const received = receiver.spans();
    assert.ok(received.length >= 2);
    assert.ok(received.every((s) => s.attributes.some((a) => a.key === "proofId" && a.value.stringValue === "proof_obs_test")));
  } finally {
    await receiver.close();
  }
});

test("createObservabilityProof is honest (not_configured) without an endpoint and stays passed locally", async () => {
  const report = await createObservabilityProof({ root, save: false });
  assert.equal(report.otlp.status, "not_configured");
  assert.equal(report.status, "passed");
  assert.equal(report.telemetrySource, "runtime-instrumented-local-workflow");
  assert.ok(report.spans.length >= 2);
});
