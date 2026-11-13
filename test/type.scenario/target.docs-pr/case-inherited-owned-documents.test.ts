import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { baseBranch, commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("본인 문서를 먼저 커밋한 제출자 main에서 분기한 문서 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  write(fixture, `${owned}/setup.md`, "# Setup notes\n");
  const forkMain = await commit(fixture, "Draft setup notes on contributor main");
  await git(fixture, "push", fixture.forkRemote, `${forkMain}:refs/heads/${baseBranch}`);
  await git(fixture, "switch", "-c", contributionBranch, forkMain);
  write(fixture, `${owned}/guide.md`, "# Project guide\n");
  await commit(fixture, "Add the guide on the contribution branch");
  await reportGit(t, fixture, "log", "--format=%h %s", `${base}..HEAD`);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
