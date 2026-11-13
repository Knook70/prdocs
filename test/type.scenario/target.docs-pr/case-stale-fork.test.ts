import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { advanceHistory, baseBranch, commit, contributionBranch, foreign, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("원본보다 100개 넘게 뒤처진 fork main에서 분기한 문서 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  const source = await advanceHistory(fixture, `${foreign}/release-notes.md`, 105, revision =>
    `# Upstream release notes\n\nRevision ${revision}.\n`);
  await git(fixture, "push", fixture.sourceRemote, `${source}:refs/heads/${baseBranch}`);

  await git(fixture, "switch", "-c", contributionBranch, base);
  write(fixture, `${owned}/guide.md`, "# Contributor guide\n");
  await commit(fixture, "Add a guide from the fork");
  await git(fixture, "push", fixture.forkRemote, contributionBranch);
  const forkMain = await git(fixture, "--git-dir", fixture.forkRemote, "rev-parse", `refs/heads/${baseBranch}`);
  assert.equal(await git(fixture, "rev-list", "--left-right", "--count", `${source}...${forkMain}`), "105\t0", "fork main is stale");
  await reportGit(t, fixture, "rev-list", "--left-right", "--count", `${source}...HEAD`);
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
