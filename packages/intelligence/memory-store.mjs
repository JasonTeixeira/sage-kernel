import crypto from "node:crypto";

import { createSqliteAdapter } from "../db/adapter.mjs";
import { validateMemoryRecordData } from "./scripts/validate-intelligence.mjs";

export function createMemoryStore(options = {}) {
  const root = options.root || process.cwd();
  const db = options.db || createSqliteAdapter({ root, schemaRoot: options.schemaRoot });
  const now = options.now || (() => new Date().toISOString());
  db.init();

  return {
    write(record) {
      const normalized = normalizeRecord(record, now);
      const failures = validateMemoryRecordData(normalized, normalized.id);
      if (failures.length > 0) {
        throw new Error(`Invalid memory record:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
      }
      db.execute(
        `INSERT INTO memory_records (
          id, project_id, kind, source, actor, confidence, observed_at,
          supersedes_json, content_json, provenance_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.id,
          normalized.projectId,
          normalized.kind,
          normalized.source,
          normalized.actor,
          normalized.confidence,
          normalized.observedAt,
          JSON.stringify(normalized.supersedes || []),
          JSON.stringify(normalized.content),
          JSON.stringify(normalized.provenance),
          now()
        ]
      );
      return normalized;
    },

    search(options = {}) {
      const limit = Math.max(1, Math.min(Number(options.limit || 20), 100));
      const rows = db.query("SELECT * FROM memory_records ORDER BY observed_at DESC LIMIT ?", [1000]);
      return rows
        .map(rowToRecord)
        .filter((record) => matchesMemoryFilters(record, options))
        .slice(0, limit);
    },

    audit() {
      const total = Number(db.scalar("SELECT COUNT(*) AS count FROM memory_records;") || 0);
      const kinds = db.query("SELECT kind, COUNT(*) AS count FROM memory_records GROUP BY kind ORDER BY kind;")
        .map((row) => ({ kind: row.kind, count: Number(row.count) }));
      const sources = db.query("SELECT source, COUNT(*) AS count FROM memory_records GROUP BY source ORDER BY source;")
        .map((row) => ({ source: row.source, count: Number(row.count) }));
      const latest = db.query("SELECT * FROM memory_records ORDER BY observed_at DESC LIMIT 5;").map(rowToRecord);
      return { total, kinds, sources, latest };
    }
  };
}

export function createMemoryRecord(input = {}, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  return normalizeRecord(input, now);
}

function normalizeRecord(record, now) {
  const observedAt = record.observedAt || now();
  const summary = record.content?.summary || record.summary;
  return {
    id: record.id || `mem_${crypto.randomUUID().replaceAll("-", "_")}`,
    projectId: record.projectId || "sage-kernel",
    kind: record.kind || "episode",
    source: record.source || "user",
    actor: record.actor || "local-user",
    confidence: record.confidence ?? 1,
    observedAt,
    supersedes: record.supersedes || [],
    content: {
      summary,
      details: record.content?.details || record.details || {},
      tags: record.content?.tags || record.tags || []
    },
    provenance: {
      evidenceType: record.provenance?.evidenceType || record.evidenceType || "manual",
      evidenceRef: record.provenance?.evidenceRef || record.evidenceRef || "local",
      ...(record.provenance?.hash || record.hash ? { hash: record.provenance?.hash || record.hash } : {})
    }
  };
}

function rowToRecord(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    source: row.source,
    actor: row.actor,
    confidence: Number(row.confidence),
    observedAt: row.observed_at,
    supersedes: parseJson(row.supersedes_json, []),
    content: parseJson(row.content_json, {}),
    provenance: parseJson(row.provenance_json, {})
  };
}

function matchesMemoryFilters(record, options) {
  if (options.projectId && record.projectId !== options.projectId) return false;
  if (options.kind && record.kind !== options.kind) return false;
  if (options.source && record.source !== options.source) return false;
  if (options.query) {
    const q = String(options.query).toLowerCase();
    return JSON.stringify(record).toLowerCase().includes(q);
  }
  return true;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
