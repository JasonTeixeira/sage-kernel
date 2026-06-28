---
description: Prove the current work is genuinely done (sage-kernel proof gate)
---

Run **sage-kernel** `kernel.enforce.proof_gate` on the current git diff.

- **If allowed:** report the `proofId` — the work is genuinely backed by a fresh, diff-matched, passing proof. Only now may it be called done.
- **If not allowed:** state exactly why (no proof / the diff changed after the last proof / a gate failed), then run `kernel.operate.run` with the current goal to close the gates, and re-check the proof gate.

Do not tell me it's "done" unless the gate returns allowed. No fake green.
