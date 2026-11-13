import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { actionsEnv, contributionBranch, git, runAndReport, seedContribution } from "./case-support.ts";

test("제출 브랜치(PR_BRANCH)가 없는 Actions 이벤트", async t => {
  const fixture = await createDocsPRFixture(t);
  const { base, head } = await seedContribution(fixture);
  await git(fixture, "push", fixture.sourceRemote, `${head}:refs/pull/1/head`);
  await git(fixture, "switch", "--detach", base);
  const result = await runAndReport(t, fixture, "check", { gh: [],
    env: { ...actionsEnv(contributionBranch, head, base), PR_BRANCH: undefined },
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Required context is missing: PR_BRANCH"), "expected failure cause/path: " + "Required context is missing: PR_BRANCH");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
