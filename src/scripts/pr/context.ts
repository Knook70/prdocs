import config from "../../../prdocs.config.ts";
import { runCommand } from "./command.ts";

type Runtime = "GITHUB_ACTIONS" | "LOCAL";

export type PRChange = Readonly<{
  status: string;
  path: string;
}>;

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Required context is missing: ${name}.`);
  }

  return value;
}

function readCurrentBranch(runtime: Runtime): string {
  if (runtime === "GITHUB_ACTIONS") {
    return readRequiredEnvironmentVariable("PR_BRANCH");
  }

  return runCommand(
    "git",
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    "pipe",
  );
}

function readPRBaseRevision(runtime: Runtime): string {
  if (runtime === "GITHUB_ACTIONS") {
    return readRequiredEnvironmentVariable("PR_BASE_REVISION");
  }

  const { baseBranch } = config.pullRequest.sourceRepository;
  return runCommand(
    "git",
    [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${baseBranch}^{commit}`,
    ],
    "pipe",
  );
}

function readSourceRepositoryBaseRevision(): string {
  const { hostname, nameWithOwner, baseBranch } =
    config.pullRequest.sourceRepository;

  return runCommand(
    "gh",
    [
      "api",
      "--hostname",
      hostname,
      `repos/${nameWithOwner}/git/ref/heads/${baseBranch}`,
      "--jq",
      ".object.sha",
    ],
    "pipe",
  );
}

function readAuthorLogin(runtime: Runtime): string {
  if (runtime === "GITHUB_ACTIONS") {
    return readRequiredEnvironmentVariable("PR_AUTHOR_LOGIN");
  }

  const { hostname } = config.pullRequest.sourceRepository;
  return runCommand(
    "gh",
    ["api", "--hostname", hostname, "user", "--jq", ".login"],
    "pipe",
  );
}

function readPRChanges(
  runtime: Runtime,
): readonly PRChange[] {
  const { baseBranch } = config.pullRequest.sourceRepository;
  const base = runtime === "GITHUB_ACTIONS"
    ? readRequiredEnvironmentVariable("PR_BASE_REVISION")
    : baseBranch;
  const fields = runCommand(
    "git",
    ["diff", "--name-status", "-z", "--no-renames", `${base}...HEAD`, "--"],
    "pipe",
  )
    .split("\0")
    .filter(Boolean);

  if (fields.length % 2 !== 0) {
    throw new Error("Git returned an incomplete status and path pair.");
  }

  return Array.from({ length: fields.length / 2 }, (_, index) => ({
    status: fields[index * 2]!,
    path: fields[index * 2 + 1]!,
  }));
}

class PRContext {
  readonly #runtime: Runtime;

  constructor() {
    this.#runtime = process.env.GITHUB_ACTIONS === "true"
      ? "GITHUB_ACTIONS"
      : "LOCAL";
  }

  getCurrentBranch(): string {
    return readCurrentBranch(this.#runtime);
  }

  getPRBaseRevision(): string {
    return readPRBaseRevision(this.#runtime);
  }

  getSourceRepositoryBaseRevision(): string {
    return readSourceRepositoryBaseRevision();
  }

  getGithubLogin(): string {
    return readAuthorLogin(this.#runtime);
  }

  getPRChanges(): readonly PRChange[] {
    return readPRChanges(this.#runtime);
  }
}

export const prContext = new PRContext();
