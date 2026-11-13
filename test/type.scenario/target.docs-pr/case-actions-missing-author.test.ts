import assert from "node:assert/strict";
import { assertCommands } from "./case-assertions.ts";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { actionsEnv, contributionBranch, git, runAndReport, seedContribution } from "./case-support.ts";

test("작성자 로그인(PR_AUTHOR_LOGIN)이 없는 Actions 이벤트", async t => {
  const fixture = await createDocsPRFixture(t);
  const { base, head } = await seedContribution(fixture);
  await git(fixture, "push", fixture.sourceRemote, `${head}:refs/pull/1/head`);
  await git(fixture, "switch", "--detach", base);
  const result = await runAndReport(t, fixture, "check", { gh: [],
    env: { ...actionsEnv(contributionBranch, head, base), PR_AUTHOR_LOGIN: undefined },
  });

  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Required context is missing: PR_AUTHOR_LOGIN"), "expected failure cause/path: " + "Required context is missing: PR_AUTHOR_LOGIN");
  assertCommands(result, "npm ci", []);
  assertCommands(result, "npm run build", []);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assert.deepEqual(result.snapshots, [], "must not reach build");
});
