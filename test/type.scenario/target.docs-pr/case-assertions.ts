import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type { DocsPRFixture, GhExpectation, Reply, RunObservation } from "./fixture.ts";
import { author, baseBranch, contributionBranch, documentRoot, sourceRepository } from "./case-support.ts";

export function userRequest(reply: Reply = { stdout: `${author}\n` }): GhExpectation {
  return { args: ["api", "--hostname", sourceRepository.hostname, "user", "--jq", ".login"], reply };
}
export function listRequest(reply: Reply = { stdout: "[]" }): GhExpectation {
  return { args: ["pr", "list", "--repo", `${sourceRepository.hostname}/${sourceRepository.nameWithOwner}`,
    "--state", "open", "--base", baseBranch, "--head", contributionBranch, "--author", author,
    "--limit", "2", "--json", "url,headRefName,headRepository,headRepositoryOwner"], reply };
}
export function createRequest(reply: Reply = { stdout: "https://example.invalid/pull/1\n" }): GhExpectation {
  return { args: ["pr", "create", "--repo", `${sourceRepository.hostname}/${sourceRepository.nameWithOwner}`,
    "--base", baseBranch], reply };
}

export function commands(result: RunObservation, label: string) {
  return result.commands.filter(event => {
    if (event.phase !== "end") return false;
    let index = 0;
    while (event.args[index] === "-c") index += 2;
    const actual = event.command === "git" ? `git ${event.args[index]}`
      : event.command === process.execPath ? `npm ${event.args.slice(1).join(" ")}`
      : event.command === "gh" ? `gh ${event.args.slice(0, 2).join(" ")}` : event.command;
    return actual === label;
  });
}
export function assertCommands(result: RunObservation, label: string, codes: number[]) {
  const events = commands(result, label);
  assert.equal(result.commands.filter(event => event.phase === "start").length,
    result.commands.filter(event => event.phase === "end").length, "all observed commands completed");
  assert.deepEqual(events.map(event => event.code), codes, `${label}: expected invocation count and exits`);
  for (const event of events) {
    assert.equal(event.signal, null, `${label}: unexpected signal`);
    assert.equal(event.error, undefined, `${label}: spawn error`);
    if (label.startsWith("npm ") && event.code === 0) assert.equal(event.injected, false, "successful npm stages must be real");
  }
}

function gitBytes(fixture: DocsPRFixture, repository: string, ...args: string[]) {
  return execFileSync("git", ["-C", repository, ...args], { env: fixture.env, maxBuffer: 32 * 1024 * 1024 });
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function tree(fixture: DocsPRFixture, repository: string, revision: string) {
  return gitBytes(fixture, repository, "ls-tree", "-rz", revision).toString().split("\0").filter(Boolean).map(entry => {
    const tab = entry.indexOf("\t");
    const [mode, , oid] = entry.slice(0, tab).split(" ");
    return { path: entry.slice(tab + 1), mode, bytes: gitBytes(fixture, repository, "cat-file", "blob", oid!) };
  });
}
function diskFiles(root: string): Record<string, Buffer> {
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory()).map(entry => {
      const path = join(entry.parentPath, entry.name);
      return [relative(root, path), entry.isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(path)}`) : readFileSync(path)];
    }));
}

/** Freeze expectations before running the app, independently of its command journal. */
export function expectedBuild(fixture: DocsPRFixture, head = "HEAD", headRepository = fixture.checkout) {
  const source = gitBytes(fixture, fixture.sourceRemote, "rev-parse", `refs/heads/${baseBranch}`).toString().trim();
  const documents = Object.fromEntries(tree(fixture, headRepository, head)
    .filter(file => file.path.startsWith(`${documentRoot}/`))
    .map(file => [file.path.slice(documentRoot.length + 1), file.bytes]));
  const system = Object.fromEntries(tree(fixture, fixture.sourceRemote, source)
    .filter(file => !file.path.startsWith(`${documentRoot}/`))
    .map(file => [file.path, digest(file.mode === "120000" ? Buffer.concat([Buffer.from("symlink:"), file.bytes]) : file.bytes)]));
  return { source, documents, system };
}
export function assertBuild(result: RunObservation, expected: ReturnType<typeof expectedBuild>, output = true) {
  const before = result.snapshots.filter(snapshot => snapshot.kind === "before-build");
  const after = result.snapshots.filter(snapshot => snapshot.kind === "after-build");
  const install = commands(result, "npm ci")[0];
  const build = commands(result, "npm run build")[0];
  assert.ok(install && build && result.commands.indexOf(install) < result.commands.indexOf(build), "install must precede build");
  for (const event of [...commands(result, "gh pr list"), ...commands(result, "git push"), ...commands(result, "gh pr create")]) {
    assert.ok(result.commands.indexOf(build) < result.commands.indexOf(event), "build must precede submission");
  }
  assert.equal(before.length, 1, "exactly one composed build tree");
  assert.equal(after.length, 1, "exactly one build result snapshot");
  assert.deepEqual(diskFiles(join(before[0]!.path, "documents")), expected.documents, "build must use complete pinned head document tree");
  assert.deepEqual(JSON.parse(readFileSync(join(before[0]!.path, "system.sha256.json"), "utf8")), expected.system,
    "build must use pinned source system bytes");
  if (!output) return;
  const html = Object.fromEntries(Object.entries(diskFiles(join(after[0]!.path, "dist"))).filter(([path]) => path.endsWith(".html")));
  const documents = Object.entries(expected.documents).filter(([path]) => path.endsWith(".md") && !path.split("/").at(-1)!.startsWith("_"));
  assert.deepEqual(Object.keys(html).sort(), documents.map(([path]) => path.replace(/\.md$/, ".html")).sort(), "HTML file set including deletions");
  for (const [path, bytes] of documents) {
    const rendered = html[path.replace(/\.md$/, ".html")]!.toString();
    const article = rendered.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article !== undefined, `${path}: document article missing`);
    // These scenarios deliberately use plain headings/paragraphs, not a second Markdown renderer.
    for (const line of bytes.toString().split("\n").filter(Boolean)) {
      const text = line.replace(/^#+\s*/, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      assert.ok(article.includes(text), `${path}: missing rendered content ${JSON.stringify(text)}`);
    }
  }
}
export function localState(fixture: DocsPRFixture) {
  const git = (...args: string[]) => gitBytes(fixture, fixture.checkout, ...args).toString();
  const paths = git("ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0").filter(Boolean);
  return {
    head: git("rev-parse", "HEAD"), index: git("ls-files", "--stage", "-z"),
    status: git("status", "--porcelain=v1", "-z", "--untracked-files=all"),
    files: Object.fromEntries(paths.map(path => {
      const full = join(fixture.checkout, path);
      return [path, existsSync(full) ? { mode: lstatSync(full).mode, bytes: lstatSync(full).isSymbolicLink() ? readlinkSync(full) : readFileSync(full) } : null];
    })),
  };
}
