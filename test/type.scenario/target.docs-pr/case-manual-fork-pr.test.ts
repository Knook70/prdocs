import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild } from "./case-assertions.ts";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { actionsEnv, baseBranch, commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("fork에 직접 push한 브랜치의 Actions 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  const contributor = { ...fixture, checkout: join(fixture.checkout, "..", "contributor") };
  await git(fixture, "clone", fixture.forkRemote, contributor.checkout);
  await git(contributor, "switch", "-c", contributionBranch);
  write(contributor, `${owned}/guide.md`, "# Installation guide\n");
  const head = await commit(contributor, "Add the installation guide from a fork");
  await git(contributor, "push", "origin", contributionBranch);

  await git(fixture, "--git-dir", fixture.sourceRemote, "fetch", fixture.forkRemote,
    `refs/heads/${contributionBranch}:refs/pull/1/head`);
  await reportGit(t, fixture, "--git-dir", fixture.forkRemote, "for-each-ref", "--format=%(refname) %(objectname)");
  await reportGit(t, fixture, "--git-dir", fixture.sourceRemote, "for-each-ref", "--format=%(refname) %(objectname)");

  await git(fixture, "switch", "--detach", base);
  const expected = expectedBuild(fixture, head, fixture.sourceRemote);
  const result = await runAndReport(t, fixture, "check", { gh: [], env: actionsEnv(contributionBranch, head, base) });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
