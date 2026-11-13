import { mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { TestContext } from "node:test";
import config from "../../../prdocs.config.ts";
import { runProcess } from "../../support/process.ts";
import type { CommandEvent, DocsPRFixture, RunObservation, RunOptions, Snapshot } from "./fixture.ts";

export const { sourceRepository, documentPR } = config.pullRequest;
export const { baseBranch } = sourceRepository;
export const documentRoot = documentPR.documentSourceRoot;
export const author = "riley";
export const owned = `${documentRoot}/${documentPR.authorDirectoryPrefix}${author}`;
export const foreign = `${documentRoot}/${documentPR.authorDirectoryPrefix}morgan`;
export const contributionBranch = `${config.pullRequest.kinds.documents.prBranchPrefix}update`;

export function write(fixture: DocsPRFixture, path: string, content: string) {
  const destination = join(fixture.checkout, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

export async function git(fixture: DocsPRFixture, ...args: string[]) {
  const result = await runProcess("git", args, { cwd: fixture.checkout, env: fixture.env });
  if (result.code !== 0) {
    throw new Error(`Git setup failed for ${JSON.stringify(args)}: ${JSON.stringify(result)}`);
  }
  return result.stdout.trim();
}

export async function reportGit(t: TestContext, fixture: DocsPRFixture, ...args: string[]) {
  const result = await runProcess("git", args, { cwd: fixture.checkout, env: fixture.env });
  t.diagnostic(JSON.stringify({ command: "git", args, ...result }));
  return result;
}

export async function commit(fixture: DocsPRFixture, message: string) {
  await git(fixture, "add", "--all");
  await git(fixture, "commit", "-m", message);
  return git(fixture, "rev-parse", "HEAD");
}

export async function seedSource(fixture: DocsPRFixture) {
  write(fixture, `${documentRoot}/home.md`, "# Portfolio\n");
  const base = await commit(fixture, "Publish the initial site");
  await git(fixture, "push", fixture.sourceRemote, `${base}:refs/heads/${baseBranch}`);
  return base;
}

export async function seedContribution(fixture: DocsPRFixture) {
  const base = await seedSource(fixture);
  await git(fixture, "switch", "-c", contributionBranch);
  write(fixture, `${owned}/update.md`, "# Project update\n\nThe release notes are ready.\n");
  const head = await commit(fixture, "Document the release");
  return { base, head };
}

export async function advanceHistory(
  fixture: DocsPRFixture,
  path: string,
  count: number,
  content: (revision: number) => string,
) {
  for (let revision = 1; revision <= count; revision++) {
    write(fixture, path, content(revision));
    await git(fixture, "add", "--", path);
    await git(fixture, "commit", "-m", `Revise ${path} (${revision})`);
  }
  return git(fixture, "rev-parse", "HEAD");
}

export function actionsEnv(branch: string, head: string, checker: string): NodeJS.ProcessEnv {
  return {
    GITHUB_ACTIONS: "true",
    PR_BRANCH: branch,
    PR_AUTHOR_LOGIN: author,
    PR_HEAD_REVISION: head,
    GITHUB_SHA: checker,
  };
}

export function existingPR(owner: string, name: string, branch: string, number = 1) {
  return {
    url: `https://${sourceRepository.hostname}/${sourceRepository.nameWithOwner}/pull/${number}`,
    headRefName: branch,
    headRepository: { name },
    headRepositoryOwner: { login: owner },
  };
}

function snapshotOutput(snapshot: Snapshot) {
  const entries = readdirSync(snapshot.path, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => ({
      path: relative(snapshot.path, join(entry.parentPath, entry.name)),
      symlink: entry.isSymbolicLink(),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    ...snapshot,
    files: entries.map(entry => entry.path),
    contents: Object.fromEntries(entries
      .filter(({ path }) => path.startsWith("documents/") || path.endsWith(".html") || path === "system.sha256.json")
      .map(({ path, symlink }) => {
        const location = join(snapshot.path, path);
        return [path, symlink ? { symlink: readlinkSync(location) } : readFileSync(location, "utf8")];
      })),
  };
}

const failureReasons = [
  [/Required context is missing: (\w+)\./, "Actions 이벤트에 필수 값이 누락됐습니다 ($1)."],
  [/The PR Branch .* must start with/, "지원하는 브랜치 접두사가 아니어서 검사를 시작할 수 없었습니다."],
  [/Needed a single revision/, "현재 HEAD에서 검사할 커밋을 찾지 못했습니다."],
  [/couldn't find remote ref (\S+)/, "원본 원격 저장소에서 $1 브랜치를 찾지 못했습니다."],
  [/upload-pack: not our ref/, "원본 원격 저장소에서 이벤트가 가리키는 제출 커밋을 가져오지 못했습니다."],
  [/A single common base is required/, "공통 조상 후보가 여러 개라 검사 기준을 하나로 정하지 못했습니다."],
  [/Every changed path must belong to/, "작성자 디렉터리 밖의 경로가 변경됐습니다."],
  [/Created and modified files must use an allowed extension/, "추가하거나 수정한 파일에 허용되지 않은 확장자가 있습니다."],
  [/Source Documents must be regular files/, "변경된 문서 경로에 일반 파일이 아닌 항목이 있습니다."],
  [/ENOTDIR: not a directory, mkdtemp/, "임시 디렉터리를 만들 위치가 디렉터리가 아니어서 빌드를 준비하지 못했습니다."],
  [/Executable frontmatter is not supported/, "문서 빌드가 실행 가능한 frontmatter를 거부했습니다."],
  [/unexpected end of the stream within a flow collection/, "문서 빌드가 닫히지 않은 YAML 목록을 읽지 못했습니다."],
  [/HTTP 401: Bad credentials/, "GitHub CLI 인증이 거절돼 작성자 로그인을 확인하지 못했습니다."],
  [/npm error code E503/, "패키지 레지스트리가 HTTP 503을 반환해 의존성 설치가 중단됐습니다."],
  [/Build process exited before producing output/, "빌드 명령이 출력물을 생성하기 전에 종료됐습니다."],
  [/HTTP 503: Service unavailable/, "GitHub CLI가 HTTP 503을 반환해 열린 PR 목록을 가져오지 못했습니다."],
  [/Unexpected end of JSON input/, "PR 조회 응답의 JSON이 중간에 끊겨 읽지 못했습니다."],
  [/More than one open pull request matches/, "조건에 맞는 열린 PR이 둘 이상이라 갱신 대상을 정하지 못했습니다."],
  [/The pull request's head repository no longer exists/, "PR의 head 저장소가 삭제돼 브랜치를 갱신할 수 없었습니다."],
  [/HTTP 403: Resource not accessible/, "GitHub CLI가 신규 PR 생성 요청에 HTTP 403을 반환했습니다."],
  [/\[rejected\].*\((?:fetch first|non-fast-forward)\)/, "원격 브랜치에 로컬에 없는 커밋이 있어 Git이 push를 거부했습니다."],
] as const;

function commandLabel({ command, args }: CommandEvent) {
  if (command === "git") {
    let index = 0;
    while (args[index] === "-c") index += 2;
    return `git ${args[index]}`;
  }
  if (command === "gh") return `gh ${args.slice(0, 2).join(" ")}`;
  if (command === process.execPath) return `npm ${args.slice(1).join(" ")}`;
  return command;
}

function explainExit(result: Pick<RunObservation, "code" | "signal" | "stderr" | "commands">) {
  if (result.signal) return `${result.signal} 신호로 중단됐습니다.`;
  if (result.code === 0) {
    const last = result.commands.findLast(command => command.phase === "end" && command.code === 0);
    const label = last && commandLabel(last);
    if (label === "gh pr create" && last?.injected) return "문서 검사를 통과했고, 모의 PR 생성 명령이 성공 응답을 반환했습니다.";
    if (label === "git push") return "기존 PR의 브랜치로 제출 커밋을 로컬 원격 저장소에 push했습니다.";
    if (label === "npm run build") return "커밋된 문서가 기여 정책 검사를 통과했고 사이트 빌드가 완료됐습니다.";
    return "명령이 오류 없이 완료됐습니다.";
  }

  const failed = result.commands.findLast(command =>
    command.phase === "end" && (command.code !== 0 || command.signal));
  const label = failed && commandLabel(failed);
  const reasons = failureReasons.flatMap(([pattern, message]) => {
    const match = result.stderr.match(pattern);
    return match ? [match[0].replace(pattern, message)] : [];
  });
  if (reasons.length === 0 && label === "git symbolic-ref") {
    reasons.push("현재 HEAD가 가리키는 브랜치를 확인하지 못했습니다.");
  }
  if (reasons.length === 0 && label === "git merge-base" && failed?.code === 1) {
    reasons.push("원본과 제출 커밋의 공통 조상을 찾지 못했습니다.");
  }
  if (failed) {
    const kind = failed.injected ? "모의 하위 명령" : "하위 명령";
    reasons.push(failed.signal
      ? `${label} ${kind}이 ${failed.signal} 신호로 중단됐습니다.`
      : `${label} ${kind}이 종료 코드 ${failed.code}로 실패했습니다.`);
  }
  return reasons.join(" ") || "명령이 오류로 종료됐습니다. 오류 메시지는 상세 출력에 있습니다.";
}

export async function runAndReport(
  t: TestContext,
  fixture: DocsPRFixture,
  entry: Parameters<DocsPRFixture["run"]>[0],
  options: RunOptions = {},
) {
  const { commands, snapshots, ...result } = await fixture.run(entry, options);
  const commandName = entry === "check" ? "PR 검사" : "PR 제출";
  const status = result.signal ? `종료 신호 ${result.signal}` : `종료 코드 ${result.code}`;
  t.diagnostic(`‘${t.name}’ 시나리오의 ${commandName} 결과 (${status}). ${explainExit({ ...result, commands })}`);
  t.diagnostic(JSON.stringify({ entry, ...result }));
  for (const command of commands) t.diagnostic(JSON.stringify(command));
  for (const snapshot of snapshots) t.diagnostic(JSON.stringify(snapshotOutput(snapshot)));
  return { ...result, commands, snapshots };
}
