import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("GitHub CLI가 잘린 JSON을 PR 조회 결과로 반환하는 상황", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", {
    gh: [userRequest(), userRequest(), listRequest({ stdout: '[{"url":' })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("JSON"), "expected failure cause/path: " + "JSON");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
