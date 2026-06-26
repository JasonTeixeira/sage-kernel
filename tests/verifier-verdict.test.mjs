import test from "node:test";
import assert from "node:assert/strict";
import { parseVerifierVerdict, adversariallyVerify } from "../packages/agents/verify.mjs";

test("verdict parser confirms only when the verdict LEADS the output", () => {
  assert.equal(parseVerifierVerdict("CONFIRMED — the fix is correct"), true);
  assert.equal(parseVerifierVerdict("VERIFIED."), true);
  assert.equal(parseVerifierVerdict("YES, it holds"), true);
});

test("verdict parser REJECTS refutations the old /verified/ regex wrongly accepted", () => {
  assert.equal(parseVerifierVerdict("REFUTED — the fix is wrong"), false);
  assert.equal(parseVerifierVerdict("not verified"), false);
  assert.equal(parseVerifierVerdict("I could not confirm this; it is unverified"), false);
  assert.equal(parseVerifierVerdict("This FAILS verification"), false);
  assert.equal(parseVerifierVerdict("The claim is false, though it reads as verified"), false);
  assert.equal(parseVerifierVerdict(""), false);
});

test("strict majority still governs acceptance with the new parser", async () => {
  const confirm = async () => ({ confirmed: true });
  const refute = async () => ({ confirmed: false });
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm, confirm, refute] })).status, "verified");
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm, refute, refute] })).status, "rejected");
  // tie -> rejected (skeptical default)
  assert.equal((await adversariallyVerify({ claim: "x", verifierRunners: [confirm, refute] })).status, "rejected");
});
