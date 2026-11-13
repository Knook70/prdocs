import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, runAndReport, seedContribution } from "./case-support.ts";

test("문서 제출 브랜치에서 시스템 파일도 직접 커밋한 제출", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  appendFileSync(join(fixture.checkout, "src/client/main.css"), "\n/* Adjust the portfolio layout. */\n");
  await commit(fixture, "Adjust the layout for the new documentation");
  const result = await runAndReport(t, fixture, "pr", { gh: [userRequest()] });

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
