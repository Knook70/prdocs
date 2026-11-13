import assert from "node:assert/strict";
import { assertBuild, assertCommands, createRequest, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("GitHub CLI가 신규 PR 생성 요청을 거절하는 상황", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", {
    gh: [userRequest(), userRequest(), listRequest(), createRequest({ exitCode: 1, stderr: "HTTP 403: Resource not accessible\n" })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("HTTP 403: Resource not accessible"), "expected failure cause/path: " + "HTTP 403: Resource not accessible");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", [1]);
  assertBuild(result, expected);
});
