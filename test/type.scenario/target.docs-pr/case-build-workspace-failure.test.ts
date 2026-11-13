import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("임시 디렉터리 경로(TMPDIR)가 파일을 가리키는 환경", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const blocked = join(fixture.checkout, "..", "blocked-tmp");
  writeFileSync(blocked, "This path is a file.\n");
  t.diagnostic(JSON.stringify({ TMPDIR: blocked }));
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()], env: { TMPDIR: blocked } });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("ENOTDIR"), "expected failure cause/path: " + "ENOTDIR");
  assert.ok(result.stderr.includes("mkdtemp"), "expected failure cause/path: " + "mkdtemp");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
