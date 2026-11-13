import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, owned, reportGit, runAndReport, seedContribution } from "./case-support.ts";

test("Markdown 경로에 심볼릭 링크를 커밋한 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const path = `${owned}/latest.md`;
  symlinkSync("update.md", join(fixture.checkout, path));
  await commit(fixture, "Link to the current release notes");
  await reportGit(t, fixture, "ls-tree", "HEAD", "--", path);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Source Documents must be regular files."), "expected failure cause/path: " + "Source Documents must be regular files.");
  assert.ok(result.stderr.includes("@riley/latest.md"), "expected failure cause/path: " + "@riley/latest.md");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
