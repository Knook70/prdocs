import { mkdirSync, mkdtempDisposableSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { runCommand } from "../command.ts";
import { extname, join } from "node:path";
import { PolicyViolation, type PolicyViolationData } from "../../src/violation.ts";
import config from "../../prdocs.config.ts";
import { prContext, type PRChange } from "./context.ts";

// ── Document check functions ───────────────

export type DocumentPRCheckContext = Readonly<{
  source: string;
  head: string;
  login: string;
  changes: readonly PRChange[];
}>;

function checkPath(
  context: DocumentPRCheckContext,
): readonly PolicyViolationData[] {
  const policy = config.pullRequest.documentPR;
  const ownedPrefix =
    `${policy.documentSourceRoot}/${policy.authorDirectoryPrefix}${context.login}/`;
  const invalidChanges = context.changes.filter(
    (change) => !change.path.startsWith(ownedPrefix),
  );

  return invalidChanges.map((change) => ({
    message:
      `Every changed path must belong to ${JSON.stringify(ownedPrefix)}. Move or limit each listed change to the Author Directory, then commit and rerun the check.`,
    path: change.path,
  }));
}

function checkExtension(
  context: DocumentPRCheckContext,
): readonly PolicyViolationData[] {
  const policy = config.pullRequest.documentPR;
  const allowedExtensions = new Set<string>(policy.allowedExtensions);
  const invalidChanges = context.changes.filter(
    (change) =>
      change.status !== "D" && !allowedExtensions.has(extname(change.path)),
  );

  const authorDirectory = join(
    policy.documentSourceRoot,
    `${policy.authorDirectoryPrefix}${context.login}`,
  );
  return invalidChanges.map((change) => ({
    message:
      `Created and modified files must use an allowed extension: ${policy.allowedExtensions.join(", ")}. Remove or replace each listed file under ${JSON.stringify(authorDirectory)}.`,
    path: change.path,
  }));
}

function checkRegularFiles(context: DocumentPRCheckContext): readonly PolicyViolationData[] {
  return context.changes
    .filter(({ status, mode }) => status !== "D" && mode !== "100644" && mode !== "100755")
    .map(({ path }) => ({ message: "Source Documents must be regular files.", path }));
}

function checkBuild(context: DocumentPRCheckContext): readonly PolicyViolationData[] {
  try {
    using temporary = mkdtempDisposableSync(join(tmpdir(), `${packageJson.name}-pr-check-`));
    runCommand("tar", ["-xf", "-", "-C", temporary.path], "utf8", {
      input: runCommand("git", ["archive", "--format=tar", context.source], "buffer", { maxBuffer: Infinity }),
    });
    const sourceRoot = config.site.documentSourceRoot;
    const root = resolve(temporary.path, sourceRoot);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    // Replace the entire document snapshot after checking the final PR changes.
    if (runCommand("git", ["ls-tree", "--name-only", context.head, "--", sourceRoot], "utf8")) {
      runCommand("tar", ["-xf", "-", "-C", temporary.path], "utf8", {
        input: runCommand("git", ["archive", "--format=tar", context.head, "--", sourceRoot], "buffer", { maxBuffer: Infinity }),
      });
    }
    runCommand(process.execPath, [process.env.npm_execpath!, "ci"], "inherit", { cwd: temporary.path });
    runCommand(process.execPath, [process.env.npm_execpath!, "run", "build"], "inherit", { cwd: temporary.path });
    return [];
  } catch (error) {
    return [{ message: error instanceof Error ? error.message : String(error) }];
  }
}


const documentPRChecks = [
  checkPath, checkExtension, checkRegularFiles,
];

// ── Runner ─────────────────────────────────

function runDocumentChecks(source: string, head: string): void {
  const base = prContext.getPRBaseRevision(source, head);
  const context = {
    source,
    head,
    login: prContext.getGithubLogin(),
    changes: prContext.getPRChanges(base, head),
  };
  const violations = documentPRChecks.flatMap(check => check(context));
  if (violations.length) throw new PolicyViolation(violations);

  const buildViolations = checkBuild(context);
  if (buildViolations.length) throw new PolicyViolation(buildViolations);
}

try {
  const runsByPrefix = new Map<string, (source: string, head: string) => void>([
    [config.pullRequest.kinds.documents.prBranchPrefix, runDocumentChecks],
  ]);
  const branch = prContext.getCurrentBranch();
  const prefix = [...runsByPrefix.keys()].find(prefix => branch.startsWith(prefix));
  const run = runsByPrefix.get(prefix ?? "");
  if (!run) throw new Error(`The PR Branch ${JSON.stringify(branch)} must start with one of: ${[...runsByPrefix.keys()].join(", ")}.`);

  const requestedHead = prContext.getPRHeadRevision();
  const { hostname, nameWithOwner, baseBranch } = config.pullRequest.sourceRepository;
  const trustedUrl = `https://${hostname}/${nameWithOwner}.git`;
  runCommand("git", ["fetch", "--no-tags", trustedUrl, `refs/heads/${baseBranch}`], "inherit");
  const source = runCommand("git", ["rev-parse", "--verify", "FETCH_HEAD^{commit}"], "utf8").trim();
  let head = requestedHead;
  if (prContext.isActions) {
    runCommand("git", ["fetch", "--no-tags", trustedUrl, requestedHead], "inherit");
    head = runCommand("git", ["rev-parse", "--verify", "FETCH_HEAD^{commit}"], "utf8").trim();
  }
  console.log({ source, head, checker: process.env.GITHUB_SHA });
  run(source, head);
  console.log("PR checks passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
