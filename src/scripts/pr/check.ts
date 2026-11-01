import { extname, join } from "node:path";
import { PolicyViolation, type PolicyViolationData } from "../../violation.ts";
import config from "../../../prdocs.config.ts";
import { prContext, type PRChange } from "./context.ts";

export type PullRequestCheckContext = Readonly<{
  localRevision: string;
  sourceRevision: string;
  workingTreeChanges: string;
}>;

export type PullRequestCheck = (
  context: PullRequestCheckContext,
) => readonly string[];

function checkWorkingTree(context: PullRequestCheckContext): readonly string[] {
  return context.workingTreeChanges
    ? ["Commit all changes before checking the pull request, or run npm run pr to commit them interactively."]
    : [];
}

function checkBaseRevision(
  context: PullRequestCheckContext,
): readonly string[] {
  const { baseBranch, nameWithOwner } = config.pullRequest.sourceRepository;
  return context.localRevision === context.sourceRevision
    ? []
    : [
        [
          `Local ${baseBranch} must match the Source Repository ${baseBranch} revision.`,
          `Local ${baseBranch}: ${context.localRevision}`,
          `${nameWithOwner} ${baseBranch}: ${context.sourceRevision}`,
          `Update local ${baseBranch} to the Source Repository revision, then rerun Pull Request Check.`,
        ].join("\n"),
      ];
}

export const pullRequestChecks: readonly PullRequestCheck[] = [
  checkWorkingTree,
  checkBaseRevision,
];

export type DocumentPRCheckContext = Readonly<{
  login: string;
  changes: readonly PRChange[];
}>;

export type DocumentPRCheck = (
  context: DocumentPRCheckContext,
) => readonly PolicyViolationData[];

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
      `Every changed path must belong to ${JSON.stringify(ownedPrefix)}. Move or limit each listed change to the Author Directory, then recreate the Document PR.`,
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

export const documentPRChecks: readonly DocumentPRCheck[] = [
  checkPath,
  checkExtension,
  checkRegularFiles,
];

try {
  if (process.argv.length > 2) throw new Error("Run npm run pr:check without options.");
  prContext.getAcceptedPRKind();
  const context = {
    localRevision: prContext.getPRBaseRevision(),
    sourceRevision: prContext.getSourceRepositoryBaseRevision(),
    workingTreeChanges: prContext.getWorkingTreeChanges(),
  };
  const failures = pullRequestChecks.flatMap((check) => check(context));
  if (failures.length) throw new Error(failures.join("\n\n"));

  const headRevision = prContext.getPRHeadRevision();
  const documentContext = {
    login: prContext.getGithubLogin(),
    changes: prContext.getPRChanges(context.localRevision, headRevision),
  };
  const violations = documentPRChecks.flatMap((check) => check(documentContext));
  if (violations.length) throw new PolicyViolation(violations);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
