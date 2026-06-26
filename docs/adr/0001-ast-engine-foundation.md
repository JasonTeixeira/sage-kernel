# ADR 0001 — Single AST parser (acorn) as the structural-analysis foundation

- Status: accepted
- Date: 2026-06-20

## Context

The review, dead-code, impact-map, mutation, and security (SAST) engines were
regex/keyword based. Regex cannot express structural facts (scope, call graphs,
control flow), capping each engine's depth and producing false positives/negatives.

## Decision

Adopt **one** trusted runtime dependency — `acorn` (+`acorn-walk`) — behind a
shared helper `packages/ast/parse.mjs` (`parseModule`, `safeParse`, `walkAst`,
`collectNodes`, `nodeLine`). Every consumer must tolerate parse failure
(`safeParse` returns `null`) and fall back to its prior heuristic. Source is all
ESM `.mjs`, so `sourceType:"module"` covers the repo; TypeScript is out of scope.

## Consequences

- Real structural analysis across 5 engines (review/dead-code/impact-map/mutation/sast).
- Relaxes the prior zero-runtime-dep stance by exactly one vetted, widely-audited parser.
- Fallback paths must stay tested (they only run on unparseable input).
