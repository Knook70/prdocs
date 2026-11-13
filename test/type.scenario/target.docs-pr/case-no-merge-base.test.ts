import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("원본과 공통 조상이 없는 문서 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "checkout", "--orphan", contributionBranch, base);
  write(fixture, `${owned}/guide.md`, "# Guide from a new repository\n");
  const head = await commit(fixture, "Import an independent copy of the project");
  await reportGit(t, fixture, "log", "--format=%h %p %s", base, head);
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git merge-base", [1]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
