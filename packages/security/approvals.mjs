import crypto from "node:crypto";

export function createApprovalSignature(approval) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalApproval(approval)))
    .digest("hex");
}

export function verifyApprovalSignature(approval) {
  if (!approval?.signature) return false;
  return createApprovalSignature(approval) === approval.signature;
}

export function createApprovalLedger({ db, signer = process.env.USER || "local-user" }) {
  if (!db) throw new Error("createApprovalLedger requires db");

  function rowToApproval(row) {
    if (!row) return null;
    return {
      id: row.id,
      action: row.action,
      status: row.status,
      reason: row.reason,
      payload: JSON.parse(row.payload_json || "{}"),
      signature: row.signature,
      decidedBy: row.decided_by,
      createdAt: row.created_at,
      decidedAt: row.decided_at
    };
  }

  return {
    request({ action, reason, payload = {} }) {
      if (!action || !reason) throw new Error("Approval request requires action and reason");
      const id = `approval_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      db.execute(
        `INSERT INTO approvals (id, action, status, reason, payload_json, created_at)
         VALUES (?, ?, 'pending', ?, ?, ?)`,
        [id, action, reason, JSON.stringify(payload), now]
      );
      return this.get(id);
    },
    approve({ id, decidedBy = signer }) {
      const approval = this.get(id);
      if (!approval) throw new Error(`Unknown approval: ${id}`);
      const decidedAt = new Date().toISOString();
      const signed = {
        ...approval,
        status: "approved",
        decidedBy,
        decidedAt
      };
      const signature = createApprovalSignature(signed);
      db.execute(
        "UPDATE approvals SET status='approved', decided_by=?, decided_at=?, signature=? WHERE id=?",
        [decidedBy, decidedAt, signature, id]
      );
      return this.get(id);
    },
    verify({ id, action, payload = {} }) {
      const approval = this.get(id);
      if (!approval) throw new Error(`Unknown approval: ${id}`);
      if (approval.status !== "approved") throw new Error(`Approval is not approved: ${id}`);
      if (approval.action !== action) throw new Error(`Approval action mismatch: ${id}`);
      if (JSON.stringify(approval.payload || {}) !== JSON.stringify(payload || {})) {
        throw new Error(`Approval scope mismatch: ${id}`);
      }
      if (!verifyApprovalSignature(approval)) throw new Error(`Approval signature invalid: ${id}`);
      return { allowed: true, approval };
    },
    list(status = null) {
      const rows = status
        ? db.query("SELECT * FROM approvals WHERE status=? ORDER BY created_at DESC LIMIT 50", [status])
        : db.query("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50");
      return rows.map(rowToApproval);
    },
    get(id) {
      return rowToApproval(db.query("SELECT * FROM approvals WHERE id=?", [id])[0] || null);
    }
  };
}

function canonicalApproval(approval) {
  return {
    id: approval.id,
    action: approval.action,
    status: approval.status,
    reason: approval.reason,
    payload: approval.payload || {},
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt || null,
    decidedBy: approval.decidedBy || null
  };
}
