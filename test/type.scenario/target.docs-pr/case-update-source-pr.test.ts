import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { contributionBranch, existingPR, git, reportGit, runAndReport, seedContribution, sourceRepository } from "./case-support.ts";

test("원본 저장소에 열린 기존 PR 갱신", async t => {
  const fixture = await createDocsPRFixture(t);
  const { base } = await seedContribution(fixture);
  const ref = `refs/heads/${contributionBranch}`;
  await git(fixture, "push", fixture.sourceRemote, `${base}:${ref}`);
  await git(fixture, "push", fixture.forkRemote, `${base}:${ref}`);
  await git(fixture, "remote", "add", "origin", fixture.forkRemote);
  const [owner, name] = sourceRepository.nameWithOwner.split("/");
  const pull = existingPR(owner, name, contributionBranch);

  await reportGit(t, fixture, "remote", "-v");
  await reportGit(t, fixture, "rev-parse", "HEAD");
  await reportGit(t, fixture, "ls-remote", fixture.sourceRemote, ref);
  await reportGit(t, fixture, "ls-remote", fixture.forkRemote, ref);

  const expected = expectedBuild(fixture);
  const headBefore = await git(fixture, "rev-parse", "HEAD");
  const sourceBefore = await git(fixture, "ls-remote", fixture.sourceRemote);
  const forkBefore = await git(fixture, "ls-remote", fixture.forkRemote);
  const result = await runAndReport(t, fixture, "pr", { gh: [userRequest(), userRequest(), listRequest({ stdout: JSON.stringify([pull]) })] });

  await reportGit(t, fixture, "ls-remote", fixture.sourceRemote, ref);
  await reportGit(t, fixture, "ls-remote", fixture.forkRemote, ref);

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", [0]);
  assertCommands(result, "gh pr create", []);
  assert.equal(await git(fixture, "ls-remote", fixture.forkRemote), forkBefore, "unrelated remote preserved");
  assert.equal(await git(fixture, "ls-remote", fixture.sourceRemote), sourceBefore.replace(`${base}\t${ref}`, `${headBefore}\t${ref}`), "only target ref updated");
  assertBuild(result, expected);
});
