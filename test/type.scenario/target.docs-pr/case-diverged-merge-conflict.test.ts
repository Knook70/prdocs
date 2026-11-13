import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { advanceHistory, baseBranch, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("양쪽 이력이 100개 넘게 갈라지고 같은 문서에서 병합 충돌이 나는 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const path = `${owned}/release-date.md`;
  write(fixture, path, "# Release date\n\nThe launch date is undecided.\n");
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  const source = await advanceHistory(fixture, path, 105, revision =>
    `# Release date\n\nSource team schedule revision ${revision}.\n`);
  await git(fixture, "push", fixture.sourceRemote, `${source}:refs/heads/${baseBranch}`);

  await git(fixture, "switch", "-c", contributionBranch, base);
  const head = await advanceHistory(fixture, path, 103, revision =>
    `# Release date\n\nContributor schedule revision ${revision}.\n`);
  await git(fixture, "push", fixture.forkRemote, contributionBranch);
  assert.equal(await git(fixture, "rev-list", "--left-right", "--count", `${source}...${head}`), "105\t103", "diverged histories");
  const merge = await reportGit(t, fixture, "merge-tree", "--write-tree", source, head);
  assert.equal(merge.code, 1, "fixture must contain a real merge conflict");
  if (merge.code === 1) t.diagnostic("git merge-tree에서 병합 충돌이 발견됐습니다 (종료 코드 1).");
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
