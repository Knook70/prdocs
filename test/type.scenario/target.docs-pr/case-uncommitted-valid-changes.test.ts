import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, localState, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { git, owned, reportGit, runAndReport, seedContribution, write } from "./case-support.ts";

test("미커밋 변경에 본인 문서 수정만 있는 상태의 로컬 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const path = `${owned}/update.md`;
  write(fixture, path, "# Staged revision\n");
  await git(fixture, "add", "--", path);
  write(fixture, path, "# Working-tree revision\n");

  t.diagnostic("Git state before the PR check");
  await reportGit(t, fixture, "rev-parse", "HEAD");
  await reportGit(t, fixture, "status", "--porcelain=v1", "--untracked-files=all");
  await reportGit(t, fixture, "diff", "--cached");
  await reportGit(t, fixture, "diff");

  const expected = expectedBuild(fixture);
  const stateBefore = localState(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  t.diagnostic("Git state after the PR check");
  await reportGit(t, fixture, "rev-parse", "HEAD");
  await reportGit(t, fixture, "status", "--porcelain=v1", "--untracked-files=all");
  await reportGit(t, fixture, "diff", "--cached");
  await reportGit(t, fixture, "diff");

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(localState(fixture), stateBefore, "local HEAD, index and working files preserved");
  assertBuild(result, expected);
});
