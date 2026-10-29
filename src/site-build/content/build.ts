import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import config from "../../../prdocs.config.ts";
import { renderDocument } from "./render.ts";

type SourcePath = string;
type SourceEvent = "add" | "change" | "unlink";
type process = () => Promise<void>;

type SourceState = {
  event: SourceEvent;
  output: { path: string };
  ignore: boolean;
  queue: process[];
  running: boolean;
};

type GenInput = Pick<SourceState, "event" | "output" | "ignore">;

function ignoreUnderscoreMarkdown(
  sourcePath: SourcePath,
  sourceStates: ReadonlyMap<SourcePath, Readonly<SourceState>>,
): readonly Readonly<{
  sourcePath: SourcePath;
  changes: Pick<SourceState, "ignore">;
}>[] {
  return basename(sourcePath).startsWith(config.site.sourceDocument.ignoredFilenamePrefix)
    && extname(sourcePath) === config.site.sourceDocument.extension
    ? [{ sourcePath, changes: { ignore: true } }]
    : [];
}

function checkAllowedExtension(
  sourcePath: SourcePath,
  sourceStates: ReadonlyMap<SourcePath, Readonly<SourceState>>,
): readonly Readonly<{ sourcePath: SourcePath; message: string }>[] {
  const allowedExtensions: readonly string[] = config.pullRequest.documentPR.allowedExtensions;

  return allowedExtensions.includes(extname(sourcePath))
    ? []
    : [{ sourcePath, message: "허용되지 않은 파일 확장자입니다." }];
}

export class Staging {
  private readonly sourceRoot: string;
  private readonly outputRoot: string;
  private readonly sourceStates = new Map<SourcePath, SourceState>();
  private readonly activeQueues = new Set<Promise<void>>();
  private initPromise?: Promise<void>;
  private closePromise?: Promise<void>;

  constructor({
    sourceRoot,
    outputRoot,
  }: {
    sourceRoot: string;
    outputRoot: string;
  }) {
    this.sourceRoot = resolve(sourceRoot);
    this.outputRoot = resolve(outputRoot);
  }

  init(): Promise<void> {
    if (this.closePromise) {
      return Promise.reject(new Error("Staging is closed."));
    }

    if (this.initPromise) {
      return Promise.reject(new Error("Staging init has already been called."));
    }

    this.initPromise = (async () => {
      const entries = await readdir(this.sourceRoot, {
        recursive: true,
        withFileTypes: true,
      });

      if (this.closePromise) {
        throw new Error("Staging closed during initialization.");
      }

      const results = await Promise.allSettled(
        entries
          .filter((entry) => entry.isFile())
          .map((entry) => this.update("add", join(entry.parentPath, entry.name))),
      );

      await Promise.all(this.activeQueues);

      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    })();

    return this.initPromise;
  }

  async update(event: string, sourcePath: SourcePath): Promise<void> {
    if (this.closePromise) {
      throw new Error("Staging is closed.");
    }

    if (event !== "add" && event !== "change" && event !== "unlink") return;

    if (!isAbsolute(sourcePath)) {
      throw new Error(`Expected an absolute source path: ${sourcePath}`);
    }

    sourcePath = resolve(sourcePath);
    const relativeSourcePath = relative(this.sourceRoot, sourcePath);

    if (
      relativeSourcePath === "" ||
      relativeSourcePath === ".." ||
      relativeSourcePath.startsWith(`..${sep}`) ||
      isAbsolute(relativeSourcePath)
    ) {
      throw new Error(`Source path is outside sourceRoot: ${sourcePath}`);
    }

    const state = Object.assign<Pick<SourceState, "queue" | "running">, GenInput>(
      this.sourceStates.get(sourcePath) ?? { queue: [], running: false },
      {
        event,
        output: {
          path: resolve(
            this.outputRoot,
            relativeSourcePath.replace(/\.md$/, ".html"),
          ),
        },
        ignore: false,
      },
    );

    this.sourceStates.set(sourcePath, state);

    const namingRules = [ignoreUnderscoreMarkdown] as const;
    const checks = [checkAllowedExtension] as const;

    // FN: 등록 순서대로 각 규칙이 Map의 모든 소스를 순회한다(ignore·큐 상태로 제외하지 않음).
    // Iterator.flatMap은 결과를 지연 평가하므로 각 결과를 반영한 상태로 다음 호출을 진행한다.
    // 반환된 sourcePath는 등록된 소스를 가리키며, changes만 얕게 덮어쓴다(뒤 변경 우선).
    // ignore도 규칙이 명시한 경우에만 바뀐다. 빈 결과는 반영 없이 다음 소스로 진행한다.
    // FN·Check에서 예외가 나면 update가 실패하고 후속 처리는 중단되며, 앞선 반영은 유지된다.
    for (const { sourcePath, changes } of namingRules.values().flatMap(
      rule => this.sourceStates.keys().flatMap(
        sourcePath => rule(sourcePath, this.sourceStates),
      ),
    )) {
      Object.assign(this.sourceStates.get(sourcePath)!, changes);
    }

    // Check: 전체 FN 반영 후, 검사 등록 순서 → Map의 모든 소스 순서로 지연 실행한다.
    // ignore·큐 상태와 무관하게 검사하며, 반환된 각 위반 대상에 즉시 ignore=true와 경고를 적용한다.
    // 위반 결과 자체로 중단하거나 경고를 중복 제거하지 않는다. 빈 결과는 그대로 통과한다.
    // 모든 검사 반영 후 아래에서 현재 이벤트의 생성 입력을 고정하고 큐에 접수한다.
    for (const { sourcePath, message } of checks.values().flatMap(
      check => this.sourceStates.keys().flatMap(
        sourcePath => check(sourcePath, this.sourceStates),
      ),
    )) {
      this.sourceStates.get(sourcePath)!.ignore = true;
      console.warn(sourcePath, message);
    }

    const genInput: GenInput = {
      event: state.event,
      output: { path: state.output.path },
      ignore: state.ignore,
    };
    const result = Promise.withResolvers<void>();

    state.queue.push(() =>
      this.generate(sourcePath, genInput).then(
        result.resolve,
        result.reject,
      ),
    );

    if (!state.running) {
      const queueRun = this.runQueue(sourcePath);
      this.activeQueues.add(queueRun);

      const forgetQueue = () => {
        this.activeQueues.delete(queueRun);
      };

      void queueRun.then(forgetQueue, forgetQueue);
    }

    return result.promise;
  }

  private async runQueue(sourcePath: SourcePath): Promise<void> {
    const state = this.sourceStates.get(sourcePath)!;
    state.running = true;

    try {
      while (state.queue.length > 0) {
        await state.queue.shift()!();
      }
    } finally {
      state.running = false;
    }

    if (state.event === "unlink") {
      this.sourceStates.delete(sourcePath);
    } else {
      state.ignore = true;
    }
  }

  private async generate(sourcePath: SourcePath, input: GenInput): Promise<void> {
    if (input.event === "unlink") {
      await rm(input.output.path, { force: true });
      return;
    }

    if (input.ignore) return;

    await mkdir(dirname(input.output.path), { recursive: true });
    await writeFile(input.output.path, await renderDocument(sourcePath));
  }

  close(): Promise<void> {
    return this.closePromise ??= Promise.allSettled([
      ...(this.initPromise ? [this.initPromise] : []),
      ...this.activeQueues,
    ]).then(() => {
      this.sourceStates.clear();
    });
  }
}
