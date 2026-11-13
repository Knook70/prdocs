import config from "../../prdocs.config.ts";
import { runCommand } from "../command.ts";
import { prContext } from "./context.ts";

type ExistingPR = {
  url: string;
  headRefName: string;
  headRepository: { name: string } | null;
  headRepositoryOwner: { login: string };
};

try {
  if (process.argv.length > 2) throw new Error("Run npm run pr without options.");
  if (prContext.isActions) throw new Error("Pull request submission is only available locally.");
  const head = prContext.getPRHeadRevision();
  const branch = prContext.getCurrentBranch();
  const login = prContext.getGithubLogin();
  const { hostname, nameWithOwner, baseBranch } = config.pullRequest.sourceRepository;
  const repository = `${hostname}/${nameWithOwner}`;
  const existing: ExistingPR[] = JSON.parse(runCommand("gh", [
    "pr", "list", "--repo", repository, "--state", "open", "--base", baseBranch,
    "--head", branch, "--author", login, "--limit", "2",
    "--json", "url,headRefName,headRepository,headRepositoryOwner",
  ], "utf8"));
  if (existing.length > 1) throw new Error("More than one open pull request matches this branch. Select its head repository before retrying.");
  const pull = existing[0];
  if (pull) {
    if (!pull.headRepository) throw new Error("The pull request's head repository no longer exists.");
    const url = `https://${hostname}/${pull.headRepositoryOwner.login}/${pull.headRepository.name}.git`;
    runCommand("git", [
      "-c", `credential.https://${hostname}.helper=`,
      "-c", `credential.https://${hostname}.helper=!gh auth git-credential`,
      "push", "--", url, `${head}:refs/heads/${pull.headRefName}`,
    ], "inherit");
    console.log(pull.url);
  } else {
    runCommand("gh", ["pr", "create", "--repo", repository, "--base", baseBranch], "inherit");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
