import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { actionsEnv, baseBranch, commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("이벤트의 제출 SHA가 fork에만 있는 상태", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  const contributor = { ...fixture, checkout: join(fixture.checkout, "..", "contributor") };
  await git(fixture, "clone", fixture.forkRemote, contributor.checkout);
  await git(contributor, "switch", "-c", contributionBranch);
  write(contributor, `${owned}/guide.md`, "# Fork-only guide\n");
  const head = await commit(contributor, "Publish a guide to the fork");
  await git(contributor, "push", "origin", contributionBranch);
  await reportGit(t, fixture, "--git-dir", fixture.forkRemote, "show-ref");
  await reportGit(t, fixture, "--git-dir", fixture.sourceRemote, "show-ref");

  await git(fixture, "switch", "--detach", base);
  const result = await runAndReport(t, fixture, "check", { gh: [], env: actionsEnv(contributionBranch, head, base) });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("not our ref"), "expected failure cause/path: " + "not our ref");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git fetch", [0, 128]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
