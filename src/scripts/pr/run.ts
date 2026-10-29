import { PolicyViolation } from "../../violation.ts";
import config from "../../../prdocs.config.ts";
import { documentPRChecks, pullRequestChecks } from "./check.ts";
import { prContext } from "./context.ts";

function runPRChecks(
  prBranchPrefix: string,
): void {
  const context = {
    branch: prContext.getCurrentBranch(),
    localRevision: prContext.getPRBaseRevision(),
    sourceRevision: prContext.getSourceRepositoryBaseRevision(),
    prBranchPrefix,
  };

  const failures = pullRequestChecks.flatMap((check) =>
    check(context)
  );

  if (failures.length > 0) {
    throw new Error(failures.join("\n\n"));
  }
}

function runDocumentPRChecks(): void {
  const context = {
    login: prContext.getGithubLogin(),
    changes: prContext.getPRChanges(),
  };

  const violations = documentPRChecks.flatMap((check) =>
    check(context)
  );

  if (violations.length > 0) {
    throw new PolicyViolation(violations);
  }
}

try {
  const runsByKind = new Map<string, () => void>([
    [
      config.pullRequest.kinds.documents.option,
      () => {
        runPRChecks(config.pullRequest.kinds.documents.prBranchPrefix);
        runDocumentPRChecks();
      },
    ],
    [
      config.pullRequest.kinds.development.option,
      () => {
        runPRChecks(config.pullRequest.kinds.development.prBranchPrefix);
      },
    ],
  ]);
  const argv = process.argv.slice(2);
  const run = argv.length === 1 ? runsByKind.get(argv[0]!) : undefined;

  if (!run) {
    throw new Error(
      `Run npm run pr:check -- <${[...runsByKind.keys()].join("|")}>.`,
    );
  }

  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
