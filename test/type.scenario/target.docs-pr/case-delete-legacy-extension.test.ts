import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("본인 디렉터리에서 기존 비 Markdown 파일 삭제", async t => {
  const fixture = await createDocsPRFixture(t);
  const path = `${owned}/legacy.txt`;
  write(fixture, path, "Old plain-text project notes.\n");
  const base = await seedSource(fixture);

  await git(fixture, "switch", "-c", contributionBranch);
  await git(fixture, "rm", "--", path);
  await commit(fixture, "Remove obsolete plain-text notes");
  await reportGit(t, fixture, "diff", "--name-status", base, "HEAD");
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
});
