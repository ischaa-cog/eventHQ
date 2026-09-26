import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, passwordProblem, verifyAgainstNothing, verifyPassword } from "./passwords";

test("passwords are stored salted and verify only with the right password", async () => {
  const first = await hashPassword("correct horse");
  const second = await hashPassword("correct horse");
  assert.match(first, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes("correct horse"));
  assert.equal(await verifyPassword("correct horse", first), true);
  assert.equal(await verifyPassword("wrong horse", first), false);
  assert.equal(await verifyPassword("correct horse", "not-a-hash"), false);
  assert.equal(await verifyAgainstNothing("anything"), false);
});

test("password rules", () => {
  assert.equal(passwordProblem("12345678"), undefined);
  assert.match(passwordProblem("1234567")!, /at least 8/);
  assert.match(passwordProblem("x".repeat(201))!, /at most 200/);
  assert.equal(passwordProblem(undefined), "Enter a password.");
});
