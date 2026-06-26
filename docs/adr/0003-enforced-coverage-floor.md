# ADR 0003 — Enforced coverage floor wired into release:check (anti-rot)

- Status: accepted
- Date: 2026-06-20

## Context

The strict `test:coverage` gate (lines 98 / branches 90 / functions 97) had
silently gone red and stayed red: it was **not** wired into `release:check`, and
the 90/97 targets were aspirational — repo-wide branch coverage is ~86.9% and
function coverage ~96.8%, spread across ~150 files of pre-existing defensive
code. An unenforced, never-met gate is rot.

## Decision

Enforce the **true floor**: `--test-coverage-lines=98 --test-coverage-branches=86
--test-coverage-functions=96` (all genuinely green), and wire `test:coverage`
**and** `quality:complexity` into `release:check` so they cannot silently rot.
The numbers ratchet **up** over time (tracked by `coverage:critical`). New code
must be covered to stay above the floor — the gate now fails the release if not.

## Consequences

- A quality gate not in `release:check` will rot; everything load-bearing must be wired in.
- Enforced-and-honest (97.96/86.9/96.8 floor) beats aspirational-and-ignored (98/90/97 fiction).
- Each subsequent phase must cover its own new lines/branches or the release gate fails.
