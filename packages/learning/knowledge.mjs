// Failure -> fix knowledge base with vector recall. Embeddings here are
// dependency-free TF (bag-of-words) vectors with cosine similarity — honestly a
// lexical-vector model, not neural, but real similarity recall (an upgrade over
// substring matching). Resolved repairs are stored so a future similar failure
// retrieves the known fix first ("gets smarter over time").

import fs from "node:fs";
import path from "node:path";
import { embed, embeddingCosine, isEmbeddingConfigured } from "./embeddings.mjs";

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

export function vectorize(text) {
  const vector = new Map();
  for (const token of tokenize(text)) vector.set(token, (vector.get(token) || 0) + 1);
  return vector;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  for (const [token, value] of a) {
    if (b.has(token)) dot += value * b.get(token);
  }
  if (normA === 0 || normB === 0) return 0;
  return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(4));
}

function storeFile(options = {}) {
  const root = options.root || process.cwd();
  return options.storeFile || path.join(root, ".sage-kernel/learning/fixes.jsonl");
}

function signatureText(signature) {
  if (typeof signature === "string") return signature;
  return [signature.category, signature.message, signature.primaryLocation?.file].filter(Boolean).join(" ");
}

export function recordFix(entry = {}, options = {}) {
  const root = options.root || process.cwd();
  const file = storeFile({ ...options, root });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const signature = signatureText(entry.signature);
  const record = {
    signature,
    category: entry.signature?.category || entry.category || null,
    fix: entry.fix || "",
    evidenceRef: entry.evidenceRef || null,
    at: options.now || new Date().toISOString()
  };
  // Store a semantic embedding when a provider is configured, so recall is
  // semantic (not just lexical) and fixes are not re-embedded on every query.
  if (options.embedder || isEmbeddingConfigured()) {
    const vector = embed(signature, options);
    if (vector) record.embedding = vector;
  }
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  return record;
}

export function readFixes(options = {}) {
  const file = storeFile(options);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Recall the most similar past fix above a similarity threshold, or null.
// Uses semantic embeddings when a provider is configured AND the stored fix has
// an embedding; otherwise falls back to the lexical TF-IDF model. The `mode`
// field on the result reports which path was used (honest about the method).
export function recallFix(query, options = {}) {
  const threshold = options.threshold ?? 0.5;
  const text = signatureText(query);
  const useSemantic = Boolean(options.embedder || isEmbeddingConfigured());
  const queryEmbedding = useSemantic ? embed(text, options) : null;
  const queryVector = vectorize(text);
  let best = null;
  for (const fix of readFixes(options)) {
    let score;
    let mode;
    if (queryEmbedding && Array.isArray(fix.embedding)) {
      score = embeddingCosine(queryEmbedding, fix.embedding);
      mode = "semantic";
    } else {
      score = cosineSimilarity(queryVector, vectorize(fix.signature));
      mode = "lexical";
    }
    if (score >= threshold && (!best || score > best.score)) best = { ...fix, score, mode };
  }
  return best;
}
