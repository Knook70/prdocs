import assert from "node:assert/strict";
import { assertBuild, assertCommands, expectedBuild, userRequest } from "./case-assertions.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createDocsPRFixture } from "./fixture.ts";
import { advanceHistory, baseBranch, contributionBranch, documentRoot, git, owned, reportGit, runAndReport, seedSource } from "./case-support.ts";

test("원본과 제출 브랜치가 각각 100개 넘게 전진한 상태의 문서 빌드", async t => {
  const fixture = await createDocsPRFixture(t);
  const base = await seedSource(fixture);
  const template = "src/site-build/document.template.html";
  const original = readFileSync(join(fixture.checkout, template), "utf8");
  const source = await advanceHistory(fixture, template, 105, revision =>
    original.replace("</head>", `  <meta name="site-revision" content="${revision}">\n</head>`));
  await git(fixture, "push", fixture.sourceRemote, `${source}:refs/heads/${baseBranch}`);

  await git(fixture, "switch", "-c", contributionBranch, base);
  await git(fixture, "push", fixture.forkRemote, `${base}:refs/heads/${baseBranch}`);
  const head = await advanceHistory(fixture, `${owned}/field-notes.md`, 103, revision =>
    `# Field notes\n\nDraft revision ${revision}.\n`);
  await git(fixture, "push", fixture.forkRemote, contributionBranch);
  assert.equal(await git(fixture, "rev-list", "--left-right", "--count", `${source}...${head}`), "105\t103", "diverged histories");
  await reportGit(t, fixture, "show", `${source}:${template}`);
  await reportGit(t, fixture, "diff", "--name-status", base, head, "--", documentRoot);
  const expected = expectedBuild(fixture);
  const result = await runAndReport(t, fixture, "check", { gh: [userRequest()] });

  assert.equal(result.code, 0, "application exit");
  assert.equal(result.signal, null);
  assert.deepEqual(result.tempLeftovers, [], "temporary build cleanup");
  assertCommands(result, "npm ci", [0]);
  assertCommands(result, "npm run build", [0]);
  assertCommands(result, "git push", []);
  assertCommands(result, "gh pr create", []);
  assertBuild(result, expected);
  const output = result.snapshots.find(snapshot => snapshot.kind === "after-build")!;
  assert.ok(readFileSync(join(output.path, "dist/@riley/field-notes.html"), "utf8").includes('name="site-revision" content="105"'), "render with latest trusted template");
});
