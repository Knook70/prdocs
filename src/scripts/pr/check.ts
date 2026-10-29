import { extname, join } from "node:path";
import type { PolicyViolationData } from "../../violation.ts";
import config from "../../../prdocs.config.ts";
import type { PRChange } from "./context.ts";

export type PullRequestCheckContext = Readonly<{
  branch: string;
  localRevision: string;
  sourceRevision: string;
  prBranchPrefix: string;
}>;

export type PullRequestCheck = (
  context: PullRequestCheckContext,
) => readonly string[];

function checkPRBranch(
  context: PullRequestCheckContext,
): readonly string[] {
  return context.branch.startsWith(context.prBranchPrefix)
    ? []
    : [
        `The PR Branch ${JSON.stringify(context.branch)} must start with ${JSON.stringify(context.prBranchPrefix)}. Switch to or create a matching PR Branch, then rerun Pull Request Check.`,
      ];
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
  checkPRBranch,
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

export const documentPRChecks: readonly DocumentPRCheck[] = [
  checkPath,
  checkExtension,
];
