import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture, forkRepository } from "./fixture.ts";
import { contributionBranch, existingPR, runAndReport, seedContribution, sourceRepository } from "./case-support.ts";

test("같은 브랜치 이름으로 열린 PR 두 건이 조회되는 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const [owner, name] = sourceRepository.nameWithOwner.split("/");
  const sourcePull = existingPR(owner, name, contributionBranch);
  const forkPull = existingPR(forkRepository.owner, forkRepository.name, contributionBranch, 2);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "pr", {
    gh: [userRequest(), userRequest(), listRequest({ stdout: JSON.stringify([sourcePull, forkPull]) })],
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("More than one open pull request matches"), "expected failure cause/path: " + "More than one open pull request matches");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
