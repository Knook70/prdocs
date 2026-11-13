import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild } from "./case-assertions.ts";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { actionsEnv, commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("원본에 직접 push한 브랜치가 전진한 뒤 이전 이벤트 SHA로 Actions 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  const contributor = { ...fixture, checkout: join(fixture.checkout, "..", "contributor") };
  await git(fixture, "clone", fixture.sourceRemote, contributor.checkout);
  await git(contributor, "switch", "-c", contributionBranch);
  write(contributor, `${owned}/release.md`, "# Release candidate\n");
  const eventHead = await commit(contributor, "Publish release candidate notes");
  await git(contributor, "push", "origin", contributionBranch);
  await git(fixture, "--git-dir", fixture.sourceRemote, "update-ref", "refs/pull/1/head", eventHead);

  write(contributor, `${owned}/release.md`, "# Final release\n");
  await commit(contributor, "Update notes after the first PR event");
  await git(contributor, "push", "origin", contributionBranch);
  await reportGit(t, fixture, "--git-dir", fixture.sourceRemote, "for-each-ref", "--format=%(refname) %(objectname)");

  await git(fixture, "switch", "--detach", base);
  const expected = expectedBuild(fixture, eventHead, fixture.sourceRemote);
  const result = await runAndReport(t, fixture, "check", { gh: [], env: actionsEnv(contributionBranch, eventHead, base) });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
