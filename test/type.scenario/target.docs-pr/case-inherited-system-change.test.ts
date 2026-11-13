import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { baseBranch, commit, contributionBranch, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("시스템 파일을 수정한 제출자 main에서 분기한 문서 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  appendFileSync(join(fixture.checkout, "src/client/main.css"), "\n/* Contributor's local layout changes. */\n");
  const forkMain = await commit(fixture, "Customize layout on contributor main");
  await git(fixture, "push", fixture.forkRemote, `${forkMain}:refs/heads/${baseBranch}`);
  await git(fixture, "switch", "-c", contributionBranch, forkMain);
  write(fixture, `${owned}/guide.md`, "# Project guide\n");
  await commit(fixture, "Add the guide on the contribution branch");
  await reportGit(t, fixture, "log", "--format=%h %s", `${base}..HEAD`);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Every changed path must belong to"), "expected failure cause/path: " + "Every changed path must belong to");
  assert.ok(result.stderr.includes("src/client/main.css"), "expected failure cause/path: " + "src/client/main.css");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
