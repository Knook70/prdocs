import assert from "node:assert/strict";
import { assertCommands, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("패키지 레지스트리 오류로 의존성 설치가 중단되는 상황", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()],
    fault: { "npm.ci": { stderr: "npm error code E503\nnpm error 503 Service Unavailable\n" } },
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("npm error code E503"), "expected failure cause/path: " + "npm error code E503");
  assertCommands(result, "npm ci", [1]);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
