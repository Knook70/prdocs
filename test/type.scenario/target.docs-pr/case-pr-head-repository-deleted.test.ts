import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture, forkRepository } from "./fixture.ts";
import { contributionBranch, existingPR, runAndReport, seedContribution } from "./case-support.ts";

test("기존 PR의 head 저장소가 삭제된 상태", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const pull = {
    ...existingPR(forkRepository.owner, forkRepository.name, contributionBranch),
    headRepository: null,
  };
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", {
    gh: [userRequest(), userRequest(), listRequest({ stdout: JSON.stringify([pull]) })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("The pull request's head repository no longer exists"), "expected failure cause/path: " + "The pull request's head repository no longer exists");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
