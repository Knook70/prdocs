import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, owned, runAndReport, seedContribution, write } from "./case-support.ts";

test("본인 문서 디렉터리에 PDF 추가", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  write(fixture, `${owned}/release-notes.pdf`, "%PDF-1.7\n");
  await commit(fixture, "Attach the release notes PDF");
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Created and modified files must use an allowed extension"), "expected failure cause/path: " + "Created and modified files must use an allowed extension");
  assert.ok(result.stderr.includes("@riley/release-notes.pdf"), "expected failure cause/path: " + "@riley/release-notes.pdf");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
