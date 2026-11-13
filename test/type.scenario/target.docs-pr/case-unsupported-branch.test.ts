import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, git, owned, runAndReport, seedSource, write } from "./case-support.ts";

test("dev/ 브랜치에서 실행한 PR 검사", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedSource(fixture);
  await git(fixture, "switch", "-c", "dev/release-notes");
  write(fixture, `${owned}/notes.md`, "# Release notes\n");
  await commit(fixture, "Write release notes on a development branch");
  const result = await runAndReport(t, fixture, "check", { gh: [] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("must start with"), "expected failure cause/path: " + "must start with");
  assert.ok(result.stderr.includes("dev/release-notes"), "expected failure cause/path: " + "dev/release-notes");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
