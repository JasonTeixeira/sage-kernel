// Dependency-free OTLP/HTTP (JSON) trace exporter + a tiny local OTLP receiver.
// The payload is the real OTLP wire format a collector (Jaeger/Tempo/Grafana/
// otelcol) accepts at POST <endpoint>/v1/traces. The receiver lets us verify the
// wire format locally without external infrastructure.

import http from "node:http";
import crypto from "node:crypto";

export function hexId(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function newTraceId() {
  return hexId(16); // 32 hex chars
}

export function newSpanId() {
  return hexId(8); // 16 hex chars
}

function toUnixNano(value) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(ms)) return "0";
  return (BigInt(Math.max(0, Math.round(ms))) * 1000000n).toString();
}

function toAttributes(attributes = {}) {
  return Object.entries(attributes).map(([key, value]) => ({ key, value: { stringValue: String(value) } }));
}

export function toOtlpPayload(spans = [], options = {}) {
  const serviceName = options.serviceName || "sage-kernel";
  return {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] },
        scopeSpans: [
          {
            scope: { name: options.scopeName || "sage-kernel.observability" },
            spans: spans.map((span) => ({
              traceId: span.traceId,
              spanId: span.spanId,
              name: span.name,
              kind: 1,
              startTimeUnixNano: toUnixNano(span.startedAt),
              endTimeUnixNano: toUnixNano(span.finishedAt),
              attributes: toAttributes(span.attributes),
              status: { code: span.attributes?.status === "failed" ? 2 : 1 }
            }))
          }
        ]
      }
    ]
  };
}

// Export spans to an OTLP/HTTP endpoint. Honest when unconfigured (never fakes a
// successful export).
export async function exportOtlp(spans = [], options = {}) {
  const endpoint = options.endpoint || process.env.SAGE_OTLP_ENDPOINT;
  if (!endpoint) {
    return { exported: false, status: "not_configured", spansSent: 0, reason: "no OTLP endpoint configured (set SAGE_OTLP_ENDPOINT)" };
  }
  const payload = toOtlpPayload(spans, options);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { exported: response.ok, status: response.ok ? "exported" : "failed", httpStatus: response.status, spansSent: spans.length, endpoint };
  } catch (error) {
    return { exported: false, status: "error", error: error.message, spansSent: spans.length, endpoint };
  }
}

// A minimal real OTLP receiver (also usable as a local dev collector). Resolves
// with the listening URL and accessors for the received spans.
export function startOtlpReceiver() {
  const batches = [];
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/traces") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          batches.push(JSON.parse(body));
        } catch {
          /* ignore malformed */
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end("{}");
      });
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        batches: () => batches,
        spans: () =>
          batches.flatMap((batch) =>
            (batch.resourceSpans || []).flatMap((rs) => (rs.scopeSpans || []).flatMap((ss) => ss.spans || []))
          ),
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}
