import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { runAndReport, seedContribution } from "./case-support.ts";

test("의존성 설치 후 빌드 명령이 오류를 반환하는 상황", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()],
    fault: { "npm.build": { exitCode: 2, stderr: "Build process exited before producing output.\n" } },
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Build process exited before producing output"), "expected failure cause/path: " + "Build process exited before producing output");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [2]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected, false);
});
