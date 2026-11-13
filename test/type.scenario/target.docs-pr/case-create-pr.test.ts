import assert from "node:assert/strict";
import { assertBuild, assertCommands, createRequest, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("열린 PR이 없는 브랜치의 신규 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", { gh: [userRequest(), userRequest(), listRequest(), createRequest()] });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", [0]);
  assertBuild(result, expected);
});
