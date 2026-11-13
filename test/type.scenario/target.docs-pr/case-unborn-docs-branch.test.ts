import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { contributionBranch, git, runAndReport } from "./case-support.ts";

test("첫 커밋이 없는 docs/ 브랜치에서 실행한 로컬 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  await git(fixture, "symbolic-ref", "HEAD", `refs/heads/${contributionBranch}`);
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Needed a single revision"), "expected failure cause/path: " + "Needed a single revision");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git rev-parse", [128]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
