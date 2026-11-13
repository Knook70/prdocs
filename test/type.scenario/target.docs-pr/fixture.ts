import assert from "node:assert/strict";
import { accessSync, constants, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "../../../prdocs.config.ts";
import { runProcess, type ProcessResult } from "../../support/process.ts";
import type { CommandEvent, FaultPoint, ObservationEvent, ObserverConfig, Reply, GhExpectation, Snapshot } from "./observe.ts";

export type { Reply, FaultPoint, CommandEvent, GhExpectation, Snapshot } from "./observe.ts";
export type RunOptions = {
  env?: NodeJS.ProcessEnv;
  gh?: GhExpectation[];
  fault?: Partial<Record<FaultPoint, Reply>>;
  timeoutMs?: number;
};
export type RunObservation = ProcessResult & {
  commands: CommandEvent[];
  snapshots: Snapshot[];
  journal: string;
  tempLeftovers: string[];
};
export type DocsPRFixture = {
  checkout: string;
  sourceRemote: string;
  forkRemote: string;
  tempRoot: string;
  env: NodeJS.ProcessEnv;
  run(entry: "check" | "submit" | "pr", options?: RunOptions): Promise<RunObservation>;
};

export const forkRepository = { owner: "fixture", name: "docs-pr-fork" } as const;
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const observer = fileURLToPath(new URL("./observe.ts", import.meta.url));

function npmCLI(): string {
  if (process.env.npm_execpath) return realpathSync(process.env.npm_execpath);
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const path = resolve(directory, "npm");
    try {
      accessSync(path, constants.X_OK);
      return realpathSync(path);
    } catch { /* Continue to the next PATH entry. */ }
  }
  throw new Error("npm CLI was not found on PATH.");
}

/** Infrastructure only: the caller supplies documents, commits, refs, and expectations. */
export async function createDocsPRFixture(t: TestContext): Promise<DocsPRFixture> {
  const root = mkdtempSync(join(tmpdir(), "docs-pr-fixture-"));
  let activeRun: Promise<RunObservation> | undefined;
  t.after(async () => {
    try { await activeRun; } catch { /* run() reports its own failure. */ }
    rmSync(root, { recursive: true, force: true });
  });
  const checkout = join(root, "checkout");
  const sourceRemote = join(root, "source.git");
  const forkRemote = join(root, "fork.git");
  const tempRoot = join(root, "tmp");
  const home = join(root, "home");
  const gitConfig = join(root, "gitconfig");
  for (const path of [checkout, tempRoot, home, join(root, "hooks")]) mkdirSync(path, { recursive: true });
  writeFileSync(gitConfig, "");
  writeFileSync(join(home, ".npmrc"), "");
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_") || key.startsWith("PR_") || key.startsWith("GH_") || key.startsWith("GITHUB_") || key.startsWith("DOCS_PR_") || key === "NODE_OPTIONS") delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "file",
    TMPDIR: tempRoot,
    NODE_COMPILE_CACHE: join(root, "node-compile-cache"),
    npm_config_userconfig: join(home, ".npmrc"),
    npm_config_cache: process.env.npm_config_cache ?? join(homedir(), ".npm"),
  });
  const git = async (args: readonly string[], cwd = checkout) => {
    const result = await runProcess("git", args, { cwd, env });
    if (result.code !== 0) throw new Error(`Fixture git failed: ${JSON.stringify(args)}\n${result.stderr}`);
    return result.stdout;
  };
  const tracked = (await git(["ls-files", "-z"], appRoot)).split("\0").filter(Boolean);
  const excluded = ["test", "tests", ".git", "node_modules", "dist", config.site.documentSourceRoot];
  for (const relative of tracked) {
    if (excluded.some(path => relative === path || relative.startsWith(`${path}/`))) continue;
    const destination = join(checkout, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(appRoot, relative), destination, { verbatimSymlinks: true });
  }
  const { hostname, nameWithOwner, baseBranch } = config.pullRequest.sourceRepository;
  await git(["init", `--initial-branch=${baseBranch}`]);
  await git(["init", "--bare", `--initial-branch=${baseBranch}`, sourceRemote]);
  await git(["init", "--bare", `--initial-branch=${baseBranch}`, forkRemote]);
  for (const [key, value] of [
    ["user.name", "Docs PR Fixture"],
    ["user.email", "docs-pr-fixture@example.invalid"],
    ["commit.gpgsign", "false"],
    ["core.autocrlf", "false"],
    ["core.hooksPath", join(root, "hooks")],
    [`url.${pathToFileURL(sourceRemote).href}.insteadOf`, `https://${hostname}/${nameWithOwner}.git`],
    [`url.${pathToFileURL(forkRemote).href}.insteadOf`, `https://${hostname}/${forkRepository.owner}/${forkRepository.name}.git`],
  ]) await git(["config", "--file", gitConfig, key!, value!]);
  const npm = npmCLI();
  let sequence = 0;
  const fixture: DocsPRFixture = {
    checkout, sourceRemote, forkRemote, tempRoot, env,
    run(entry, options = {}) {
      if (activeRun) return Promise.reject(new Error("Run one command at a time in each fixture."));
      activeRun = (async () => {
        const runRoot = join(root, `run-${++sequence}`);
        const snapshots = join(runRoot, "snapshots");
        mkdirSync(snapshots, { recursive: true });
        const journal = join(runRoot, "commands.jsonl");
        writeFileSync(journal, "");
        const observerConfig: ObserverConfig = {
          journal, snapshots,
          documentRoot: config.site.documentSourceRoot,
          outputRoot: config.build.outputRoot,
          gh: options.gh ?? [],
          fault: options.fault ?? {},
        };
        const observerConfigPath = join(runRoot, "observer.json");
        writeFileSync(observerConfigPath, JSON.stringify(observerConfig));
        const runEnv: NodeJS.ProcessEnv = {
          ...env, ...options.env,
          npm_execpath: npm,
          DOCS_PR_CHECKOUT: checkout,
          DOCS_PR_OBSERVER: observerConfigPath,
          NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(observer).href)}`,
        };
        const args = entry === "pr" ? [npm, "run", "pr"] : [join(checkout, `scripts/pr/${entry}.ts`)];
        const result = await runProcess(process.execPath, args, { cwd: checkout, env: runEnv, timeoutMs: options.timeoutMs });
        const events = readFileSync(journal, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line) as ObservationEvent);
        t.diagnostic(JSON.stringify({ entry, ...result, events }));
        const errors = events.filter(event => event.type === "system-error");
        if (errors.length || result.stderr.includes("DOCS_PR_HARNESS_ERROR:")) {
          throw new Error(`PR observation failed: ${JSON.stringify(errors)}\n${result.stderr}`, { cause: result });
        }
        assert.equal(events.filter(event => event.type === "command" && event.phase === "end" && event.command === "gh").length,
          observerConfig.gh.length, "Unused gh request expectations");
        for (const point of Object.keys(observerConfig.fault)) {
          const [tool, operation] = point.split(".");
          assert.ok(events.some(event => {
            if (event.type !== "command" || event.phase !== "end" || !event.injected) return false;
            if (tool === "npm") return event.command === process.execPath &&
              (operation === "ci" ? event.args[1] === "ci" : event.args.slice(1).join(" ") === "run build");
            let index = 0;
            while (event.args[index] === "-c") index += 2;
            return event.command === "git" && event.args[index] === operation;
          }), `Unused fault: ${point}`);
        }
        return {
          ...result, journal,
          commands: events.filter((event): event is CommandEvent => event.type === "command"),
          snapshots: events.filter((event): event is Snapshot => event.type === "snapshot"),
          tempLeftovers: readdirSync(tempRoot).sort(),
        };
      })();
      const result = activeRun;
      void result.finally(() => { activeRun = undefined; }).catch(() => {});
      return result;
    },
  };
  return fixture;
}
