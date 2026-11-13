import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, owned, runAndReport, seedContribution, write } from "./case-support.ts";

test("닫히지 않은 YAML 목록이 포함된 문서 빌드", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  write(fixture, `${owned}/guide.md`, "---\ntitle: [Installation, Configuration\n---\n# Guide\n");
  await commit(fixture, "Add a guide with an unfinished metadata list");
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("unexpected end of the stream within a flow collection"), "expected failure cause/path: " + "unexpected end of the stream within a flow collection");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [1]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected, false);
});
