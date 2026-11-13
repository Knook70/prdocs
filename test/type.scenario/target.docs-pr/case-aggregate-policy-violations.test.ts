import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, foreign, owned, runAndReport, seedContribution, write } from "./case-support.ts";

test("타인 경로, 허용되지 않은 확장자, 심볼릭 링크가 함께 들어간 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  write(fixture, `${foreign}/notes.md`, "# Notes for another author\n");
  write(fixture, `${owned}/release.csv`, "version,date\n2,2026-11-13\n");
  symlinkSync("update.md", join(fixture.checkout, owned, "latest.md"));
  await commit(fixture, "Collect release materials");
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Every changed path must belong to"), "expected failure cause/path: " + "Every changed path must belong to");
  assert.ok(result.stderr.includes("Created and modified files must use an allowed extension"), "expected failure cause/path: " + "Created and modified files must use an allowed extension");
  assert.ok(result.stderr.includes("Source Documents must be regular files."), "expected failure cause/path: " + "Source Documents must be regular files.");
  assert.ok(result.stderr.includes("@morgan/notes.md"), "expected failure cause/path: " + "@morgan/notes.md");
  assert.ok(result.stderr.includes("@riley/release.csv"), "expected failure cause/path: " + "@riley/release.csv");
  assert.ok(result.stderr.includes("@riley/latest.md"), "expected failure cause/path: " + "@riley/latest.md");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
