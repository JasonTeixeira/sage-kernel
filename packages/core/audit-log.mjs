const SECRET_KEY_PATTERN = /token|secret|password|apikey|api_key|authorization/i;

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(item)
    ])
  );
}

export function createAuditSink({ db } = {}) {
  if (!db?.execute) return null;
  return (event) => {
    db.execute(
      `INSERT INTO audit_events (id, type, subject, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        `audit_${cryptoRandomId()}`,
        event.type,
        event.tool || event.subject || null,
        JSON.stringify(redactSecrets(event)),
        event.at
      ]
    );
  };
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
