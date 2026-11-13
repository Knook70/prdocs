import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { baseBranch, commit, contributionBranch, foreign, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("양쪽이 서로의 커밋을 병합해 공통 조상 후보가 둘인 이력", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  write(fixture, `${foreign}/news.md`, "# Upstream news\n");
  const sourceSide = await commit(fixture, "Publish upstream news");

  await git(fixture, "switch", "-c", contributionBranch, base);
  write(fixture, `${owned}/guide.md`, "# Contributor guide\n");
  const contributorSide = await commit(fixture, "Add a guide");
  await git(fixture, "merge", "--no-ff", "--no-edit", sourceSide);

  await git(fixture, "switch", baseBranch);
  await git(fixture, "merge", "--no-ff", "--no-edit", contributorSide);
  await git(fixture, "push", fixture.sourceRemote, baseBranch);
  await git(fixture, "switch", contributionBranch);

  await reportGit(t, fixture, "log", "--graph", "--format=%h %s", "--all");
  assert.deepEqual((await git(fixture, "merge-base", "--all", baseBranch, "HEAD")).split("\n").sort(), [sourceSide, contributorSide].sort(), "two merge bases");
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("A single common base is required"), "expected failure cause/path: " + "A single common base is required");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git merge-base", [0]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
