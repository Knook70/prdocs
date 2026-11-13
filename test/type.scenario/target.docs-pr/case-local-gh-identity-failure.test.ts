import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("GitHub CLI 인증이 만료된 상태의 로컬 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const result = await runAndReport(t, fixture, "check", {
    gh: [userRequest({ exitCode: 1, stderr: "HTTP 401: Bad credentials\n" })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("HTTP 401: Bad credentials"), "expected failure cause/path: " + "HTTP 401: Bad credentials");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
