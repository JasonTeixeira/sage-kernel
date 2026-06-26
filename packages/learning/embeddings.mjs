// Provider-gated semantic embeddings. When SAGE_EMBEDDING_COMMAND is set (or an
// embedder is injected), text is embedded into a dense vector for real semantic
// recall; otherwise callers fall back to the lexical TF-IDF model. Never throws:
// a missing/failed provider returns null so the caller degrades gracefully.

import { spawnSync } from "node:child_process";

export function isEmbeddingConfigured(env = process.env) {
  return Boolean(env.SAGE_EMBEDDING_COMMAND && String(env.SAGE_EMBEDDING_COMMAND).trim());
}

// Embed text -> number[] (or null). options.embedder injects a function for tests.
export function embed(text, options = {}) {
  if (typeof options.embedder === "function") return normalizeVector(options.embedder(text));
  const command = options.command || process.env.SAGE_EMBEDDING_COMMAND;
  if (!command) return null;
  const result = spawnSync(command, { input: String(text ?? ""), shell: true, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 * 8 });
  if (result.status !== 0) return null;
  try {
    return normalizeVector(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

export function embeddingCosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

// Accepts a raw array, or a provider envelope like {embedding:[...]} / {data:[{embedding:[...]}]}.
function normalizeVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (Array.isArray(value?.embedding)) return value.embedding.map(Number);
  if (Array.isArray(value?.data) && Array.isArray(value.data[0]?.embedding)) return value.data[0].embedding.map(Number);
  return null;
}
