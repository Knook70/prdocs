import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { commit, owned, runAndReport, seedContribution, write } from "./case-support.ts";

test("JavaScript frontmatter가 포함된 문서 빌드", async t => {
  const fixture = await createDocsPRFixture(t);
  await seedContribution(fixture);
  const marker = join(fixture.checkout, "..", "frontmatter-executed");
  write(fixture, `${owned}/guide.md`,
    `---javascript\nprocess.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "executed");\n---\n# Guide\n`);
  await commit(fixture, "Add a guide with JavaScript frontmatter");
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(existsSync(marker), false, "JavaScript frontmatter must never execute");
  assert.equal(result.code, 1, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assert.ok(result.stderr.includes("Executable frontmatter is not supported"), "expected failure cause/path: " + "Executable frontmatter is not supported");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [1]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected, false);
});
