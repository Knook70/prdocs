import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, listRequest, userRequest } from "./case-assertions.ts";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture, forkRepository } from "./fixture.ts";
import { baseBranch, commit, contributionBranch, existingPR, git, owned, reportGit, runAndReport, seedContribution, write } from "./case-support.ts";

test("기존 PR의 fork 브랜치가 다른 체크아웃에서 먼저 전진한 상태", async t => {
  const fixture = await createDocsPRFixture(t);
  const { base } = await seedContribution(fixture);
  const ref = `refs/heads/${contributionBranch}`;
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`, `${base}:${ref}`);
  const otherCheckout = { ...fixture, checkout: join(fixture.checkout, "..", "other-checkout") };
  await git(fixture, "clone", "--branch", contributionBranch, fixture.forkRemote, otherCheckout.checkout);
  write(otherCheckout, `${owned}/deployment.md`, "# Deployment notes from a second workstation\n");
  await commit(otherCheckout, "Publish deployment notes from another checkout");
  await git(otherCheckout, "push", "origin", contributionBranch);

  const pull = existingPR(forkRepository.owner, forkRepository.name, contributionBranch);
  await reportGit(t, fixture, "rev-parse", "HEAD");
  await reportGit(t, fixture, "ls-remote", fixture.forkRemote, ref);

  const expected = expectedBuild(fixture);
  const headBefore = await git(fixture, "rev-parse", "HEAD");
  const sourceBefore = await git(fixture, "ls-remote", fixture.sourceRemote);
  const forkBefore = await git(fixture, "ls-remote", fixture.forkRemote);
  const result = await runAndReport(t, fixture, "pr", { gh: [userRequest(), userRequest(), listRequest({ stdout: JSON.stringify([pull]) })] });

  await reportGit(t, fixture, "ls-remote", fixture.forkRemote, ref);

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("[rejected]"), "expected failure cause/path: " + "[rejected]");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", [1]);
  assertCommands(result, "gh pr create", []);
  assert.equal(await git(fixture, "ls-remote", fixture.sourceRemote), sourceBefore);
  assert.equal(await git(fixture, "ls-remote", fixture.forkRemote), forkBefore);
  assertBuild(result, expected);
});
