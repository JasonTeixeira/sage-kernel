// Hallucination metric — built on the proof spine. A hallucination is a success
// claim with no backing evidence: per the claim firewall, that is a claim whose
// status is unsupported (no proof), stale (expired proof), or external_unproven
// (claims of public release / client connection that cannot be evidenced).
// Supported claims and honest blocked statuses are NOT hallucinations.
//
// This makes "get rid of hallucinations" measurable: hallucination rate =
// unbacked success claims / total success claims.

import { verifyReport } from "./claim-firewall.mjs";

const CLAIM_STATUSES = new Set(["supported", "unsupported", "stale", "external_unproven"]);
const HALLUCINATION_STATUSES = new Set(["unsupported", "stale", "external_unproven"]);

export function computeHallucinationRate(text, options = {}) {
  const report = verifyReport(text, options);
  const claims = report.findings.filter((finding) => CLAIM_STATUSES.has(finding.status));
  const hallucinations = claims.filter((finding) => HALLUCINATION_STATUSES.has(finding.status));
  const supported = claims.filter((finding) => finding.status === "supported");
  const total = claims.length;
  const rate = total > 0 ? hallucinations.length / total : 0;
  return {
    totalClaims: total,
    supportedClaims: supported.length,
    hallucinatedClaims: hallucinations.length,
    rate: Number(rate.toFixed(4)),
    hallucinations: hallucinations.map((finding) => ({
      line: finding.lineNumber,
      term: finding.term,
      status: finding.status,
      text: finding.line
    }))
  };
}

// Aggregate across multiple report sources. threshold defaults to 0 (zero
// tolerance): any unbacked success claim fails the gate.
export function scanReports(items = [], options = {}) {
  const threshold = options.threshold ?? 0;
  const reports = items.map((item) => ({
    source: item.source || "input",
    ...computeHallucinationRate(item.text, { root: options.root })
  }));
  const totalClaims = reports.reduce((sum, report) => sum + report.totalClaims, 0);
  const hallucinatedClaims = reports.reduce((sum, report) => sum + report.hallucinatedClaims, 0);
  const rate = totalClaims > 0 ? hallucinatedClaims / totalClaims : 0;
  return {
    status: rate <= threshold ? "passed" : "failed",
    rate: Number(rate.toFixed(4)),
    threshold,
    totalClaims,
    hallucinatedClaims,
    reports
  };
}
