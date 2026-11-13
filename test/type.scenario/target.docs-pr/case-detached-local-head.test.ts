import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { git, runAndReport, seedContribution } from "./case-support.ts";

test("브랜치 없이 특정 커밋을 체크아웃한 로컬 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  const { head } = await seedContribution(fixture);
  await git(fixture, "switch", "--detach", head);
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertCommands(result, "git symbolic-ref", [1]);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
