import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import config from "../../../prdocs.config.ts";
import { runCommand } from "./command.ts";

export type PRChange = Readonly<{
  status: string;
  mode: string;
  path: string;
}>;

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required context is missing: ${name}.`);
  return value;
}

class PRContext {
  readonly isActions = process.env.GITHUB_ACTIONS === "true";

  getCurrentBranch(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_BRANCH")
      : runCommand("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], "pipe");
  }

  getAcceptedPRKind() {
    const branch = this.getCurrentBranch();
    const { documents, development } = config.pullRequest.kinds;
    if (branch.startsWith(documents.prBranchPrefix)) return documents;
    if (branch.startsWith(development.prBranchPrefix)) {
      throw new Error("Development pull requests are not accepted yet.");
    }
    throw new Error(`The PR Branch ${JSON.stringify(branch)} must start with ${JSON.stringify(documents.prBranchPrefix)}.`);
  }

  getPRBaseRevision(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_BASE_REVISION")
      : runCommand("git", ["rev-parse", "--verify", `refs/heads/${config.pullRequest.sourceRepository.baseBranch}^{commit}`], "pipe");
  }

  getPRHeadRevision(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_HEAD_REVISION")
      : runCommand("git", ["rev-parse", "--verify", "HEAD^{commit}"], "pipe");
  }

  getSourceRepositoryBaseRevision(): string {
    const { hostname, nameWithOwner, baseBranch } = config.pullRequest.sourceRepository;
    return runCommand("gh", ["api", "--hostname", hostname, `repos/${nameWithOwner}/git/ref/heads/${baseBranch}`, "--jq", ".object.sha"], "pipe");
  }

  getGithubLogin(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_AUTHOR_LOGIN")
      : runCommand("gh", ["api", "--hostname", config.pullRequest.sourceRepository.hostname, "user", "--jq", ".login"], "pipe");
  }

  getWorkingTreeChanges(): string {
    return this.isActions
      ? ""
      : runCommand("git", ["status", "--porcelain=v1", "--untracked-files=all"], "pipe");
  }

  getPRChanges(base: string, head: string): readonly PRChange[] {
    const fields = runCommand("git", [
      "diff", "--raw", "--no-abbrev", "--no-renames", "-z",
      `${base}...${head}`, "--",
    ], "pipe").split("\0");
    fields.pop();
    return Array.from({ length: fields.length / 2 }, (_, index) => {
      const [, mode, , , status] = fields[index * 2]!.split(" ");
      return { status: status!, mode: mode!, path: fields[index * 2 + 1]! };
    });
  }
}

export const prContext = new PRContext();

export function prepareActionsDocuments(): void {
  if (!prContext.isActions) throw new Error("Document preparation requires GitHub Actions context.");
  const { hostname, nameWithOwner } = config.pullRequest.sourceRepository;
  const head = prContext.getPRHeadRevision();
  runCommand("git", ["fetch", "--no-tags", `https://${hostname}/${nameWithOwner}.git`, head], "inherit");

  const sourceRoot = config.site.documentSourceRoot;
  const root = resolve(sourceRoot);
  const tree = new TextDecoder("utf-8", { fatal: true }).decode(execFileSync("git", [
    "ls-tree", "-r", "-z", "--full-tree", head, "--", sourceRoot,
  ]));
  const entries = tree.split("\0");
  entries.pop();
  const documents = entries.map((entry) => {
    const tab = entry.indexOf("\t");
    const [mode, type, object] = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    const target = resolve(path);
    const withinRoot = relative(root, target);
    if ((mode !== "100644" && mode !== "100755") || type !== "blob") {
      throw new Error(`Source Documents must be regular files: ${JSON.stringify(path)}.`);
    }
    if (!withinRoot || withinRoot === ".." || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) {
      throw new Error(`Source Document is outside its root: ${JSON.stringify(path)}.`);
    }
    return { target, object: object! };
  });

  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const { target, object } of documents) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, execFileSync("git", ["cat-file", "blob", object]), { flag: "wx" });
  }
}
