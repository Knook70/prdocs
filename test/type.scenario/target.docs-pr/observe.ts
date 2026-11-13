import assert from "node:assert/strict";
import childProcess, { type SpawnSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";

export type Reply = { stdout?: string; stderr?: string; exitCode?: number };
export type GhExpectation = { args: string[]; reply: Reply };
export type FaultPoint = "git.fetch" | "git.push" | "npm.ci" | "npm.build";
export type CommandEvent = {
  type: "command";
  phase: "start" | "end";
  id: string;
  command: string;
  args: string[];
  cwd: string;
  injected: boolean;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
};
export type Snapshot = {
  type: "snapshot";
  kind: "before-build" | "after-build";
  commandId: string;
  path: string;
};
export type ObservationEvent = CommandEvent | Snapshot | { type: "system-error"; message: string };
export type ObserverConfig = {
  journal: string;
  snapshots: string;
  documentRoot: string;
  outputRoot: string;
  gh: GhExpectation[];
  fault: Partial<Record<FaultPoint, Reply>>;
};

function systemHashes(root: string, documentRoot: string, outputRoot: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const excluded = new Set([".git", "node_modules", documentRoot, outputRoot]);
  function visit(relative: string) {
    if (excluded.has(relative)) return;
    const path = join(root, relative);
    const stat = lstatSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(relative ? `${relative}/${name}` : name);
    } else {
      const bytes = stat.isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(path)}`) : readFileSync(path);
      hashes[relative] = createHash("sha256").update(bytes).digest("hex");
    }
  }
  visit("");
  return hashes;
}

// All expected gh options take one value. Keep positional order, normalize option order,
// and retain duplicates so extra flags cannot disappear into a map.
function normalizeGh(args: readonly string[]) {
  const positional: string[] = [];
  const options: string[][] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg.startsWith("--")) {
      assert.ok(args[index + 1] !== undefined, `Missing value for ${arg}`);
      options.push([arg, args[++index]!]);
    } else positional.push(arg);
  }
  return { positional, options: options.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}

function install(config: ObserverConfig) {
  const originalSpawnSync = childProcess.spawnSync;
  const replyPath = fileURLToPath(new URL("./reply.ts", import.meta.url));
  let sequence = 0;
  const record = (event: ObservationEvent) => appendFileSync(config.journal, `${JSON.stringify(event)}\n`);
  const systemError = (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    // stderr remains a fallback if the journal itself cannot be written.
    process.stderr.write(`DOCS_PR_HARNESS_ERROR: ${message}\n`);
    record({ type: "system-error", message });
  };
  const wrapped = (command: string, args: readonly string[] = [], options: SpawnSyncOptions = {}) => {
    const cwd = options.cwd instanceof URL ? fileURLToPath(options.cwd) : String(options.cwd ?? process.cwd());
    const id = `${process.pid}-${++sequence}`;
    let gitIndex = 0;
    while (args[gitIndex] === "-c") gitIndex += 2;
    const gitCommand = command === "git" ? args[gitIndex] : undefined;
    const npm = command === process.execPath && args[0] === process.env.npm_execpath;
    const point: FaultPoint | undefined = gitCommand === "fetch" ? "git.fetch"
      : gitCommand === "push" ? "git.push"
      : npm && args[1] === "ci" ? "npm.ci"
      : npm && args[1] === "run" && args[2] === "build" ? "npm.build" : undefined;
    const injected = command === "gh" || (point !== undefined && config.fault[point] !== undefined);
    const event = { type: "command" as const, id, command, args: [...args], cwd, injected };
    try {
      record({ ...event, phase: "start" });
      if (point === "npm.build") {
        const path = join(config.snapshots, `${id}-before-build`);
        mkdirSync(path, { recursive: true });
        if (existsSync(join(cwd, config.documentRoot))) {
          cpSync(join(cwd, config.documentRoot), join(path, "documents"), { recursive: true, verbatimSymlinks: true });
        }
        writeFileSync(join(path, "system.sha256.json"), JSON.stringify(systemHashes(cwd, config.documentRoot, config.outputRoot), null, 2));
        record({ type: "snapshot", kind: "before-build", commandId: id, path });
      }
      const fault = point === undefined ? undefined : config.fault[point];
      let reply: Reply | undefined = fault === undefined ? undefined : { exitCode: 1, ...fault };
      if (command === "gh") {
        // The journal spans both check and submit processes; do not use a process-local counter.
        const starts = readFileSync(config.journal, "utf8").trim().split("\n")
          .map(line => JSON.parse(line) as ObservationEvent)
          .filter(event => event.type === "command" && event.phase === "start" && event.command === "gh");
        const expected = config.gh[starts.length - 1];
        assert.ok(expected, `Unexpected gh request: ${JSON.stringify(args)}`);
        assert.deepEqual(normalizeGh(args), normalizeGh(expected.args), "gh request contract mismatch");
        reply = expected.reply;
      }
      const result = reply === undefined
        ? originalSpawnSync(command, args, options)
        : originalSpawnSync(process.execPath, [replyPath], {
          ...options,
          env: { ...(options.env ?? process.env), DOCS_PR_REPLY: JSON.stringify(reply) },
        });
      record({ ...event, phase: "end", code: result.status, signal: result.signal, error: result.error?.message });
      if (point === "npm.build") {
        const path = join(config.snapshots, `${id}-after-build`);
        mkdirSync(path, { recursive: true });
        if (existsSync(join(cwd, config.outputRoot))) {
          cpSync(join(cwd, config.outputRoot), join(path, "dist"), { recursive: true, verbatimSymlinks: true });
        }
        record({ type: "snapshot", kind: "after-build", commandId: id, path });
      }
      return result;
    } catch (error) {
      systemError(error);
      throw error;
    }
  };
  mock.method(childProcess, "spawnSync", wrapped as typeof childProcess.spawnSync);
  syncBuiltinESMExports();
}

// NODE_OPTIONS is inherited by npm, builds, and controlled reply children.
// Only the two exact copied PR entrypoints install the observer.
const checkout = process.env.DOCS_PR_CHECKOUT;
const entry = process.argv[1] && resolve(process.argv[1]);
if (checkout && entry && ["check.ts", "submit.ts"].some(name => entry === join(checkout, "scripts/pr", name))) {
  try {
    install(JSON.parse(readFileSync(process.env.DOCS_PR_OBSERVER!, "utf8")) as ObserverConfig);
  } catch (error) {
    process.stderr.write(`DOCS_PR_HARNESS_ERROR: ${String(error)}\n`);
    throw error;
  }
}
