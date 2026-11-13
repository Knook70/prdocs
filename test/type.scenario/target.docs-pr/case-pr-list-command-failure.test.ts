import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("열린 PR 목록을 가져오는 GitHub CLI 명령이 실패하는 상황", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", {
    gh: [userRequest(), userRequest(), listRequest({ exitCode: 1, stderr: "HTTP 503: Service unavailable\n" })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("HTTP 503: Service unavailable"), "expected failure cause/path: " + "HTTP 503: Service unavailable");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
