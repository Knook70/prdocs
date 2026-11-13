import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { baseBranch, git, reportGit, runAndReport, seedContribution } from "./case-support.ts";

test("원본 원격 저장소에 main 브랜치가 없는 상태", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  await git(fixture, "--git-dir", fixture.sourceRemote, "update-ref", "-d", `refs/heads/${baseBranch}`);
  await reportGit(t, fixture, "--git-dir", fixture.sourceRemote, "for-each-ref", "--format=%(refname) %(objectname)");
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("couldn't find remote ref refs/heads/main"), "expected failure cause/path: " + "couldn't find remote ref refs/heads/main");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git fetch", [128]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
