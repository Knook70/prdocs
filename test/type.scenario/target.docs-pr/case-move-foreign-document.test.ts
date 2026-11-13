import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, contributionBranch, foreign, git, owned, reportGit, runAndReport, seedSource, write } from "./case-support.ts";

test("타인 문서를 본인 디렉터리로 이동한 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  const original = `${foreign}/reference.md`;
  const destination = `${owned}/reference.md`;
  write(fixture, original, "# Shared reference\n");
  const base = await seedSource(fixture);

  await git(fixture, "switch", "-c", contributionBranch);
  mkdirSync(join(fixture.checkout, owned), { recursive: true });
  await git(fixture, "mv", "--", original, destination);
  await commit(fixture, "Move the reference into my portfolio");
  await reportGit(t, fixture, "diff", "--name-status", "--no-renames", base, "HEAD");
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Every changed path must belong to"), "expected failure cause/path: " + "Every changed path must belong to");
  assert.ok(result.stderr.includes("@morgan/"), "expected failure cause/path: " + "@morgan/");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
