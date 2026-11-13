import config from "../../prdocs.config.ts";
import { runCommand } from "../command.ts";

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
      : runCommand("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], "utf8").trim();
  }



  getPRBaseRevision(source: string, head: string): string {
    const bases = runCommand("git", ["merge-base", "--all", source, head], "utf8").trim().split("\n");
    if (bases.length !== 1 || !bases[0]) throw new Error("A single common base is required. Fetch complete history before retrying.");
    return bases[0];
  }



  getPRHeadRevision(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_HEAD_REVISION")
      : runCommand("git", ["rev-parse", "--verify", "HEAD^{commit}"], "utf8").trim();
  }



  getGithubLogin(): string {
    return this.isActions
      ? readRequiredEnvironmentVariable("PR_AUTHOR_LOGIN")
      : runCommand("gh", ["api", "--hostname", config.pullRequest.sourceRepository.hostname, "user", "--jq", ".login"], "utf8").trim();
  }



  getPRChanges(base: string, head: string): readonly PRChange[] {
    const fields = runCommand("git", [
      "diff", "--raw", "--no-abbrev", "--no-renames", "-z",
      base, head, "--",
    ], "utf8", { maxBuffer: Infinity }).split("\0");
    fields.pop();
    return Array.from({ length: fields.length / 2 }, (_, index) => {
      const [, mode, , , status] = fields[index * 2]!.split(" ");
      return { status: status!, mode: mode!, path: fields[index * 2 + 1]! };
    });
  }
}

export const prContext = new PRContext();
