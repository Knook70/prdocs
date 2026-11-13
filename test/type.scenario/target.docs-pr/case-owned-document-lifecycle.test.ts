import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("본인 문서를 한 번에 추가·수정·삭제하는 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  write(fixture, `${owned}/about.md`, "# About the project\n\nFirst draft.\n");
  write(fixture, `${owned}/retired.md`, "# Retired project\n");
  const base = await seedSource(fixture);

  await git(fixture, "switch", "-c", contributionBranch);
  write(fixture, `${owned}/about.md`, "# About the project\n\nUpdated for this release.\n");
  write(fixture, `${owned}/projects/새 가이드.md`, "# New guide\n");
  await git(fixture, "rm", "--", `${owned}/retired.md`);
  await commit(fixture, "Refresh the project portfolio");
  await reportGit(t, fixture, "diff", "--name-status", base, "HEAD");
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
