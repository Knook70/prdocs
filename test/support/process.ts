import { spawn } from "node:child_process";

export type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type ProcessOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

/** Nonzero exits are observations. Spawn failures and timeouts are harness errors. */
export function runProcess(
  command: string,
  args: readonly string[],
  { cwd, env, timeoutMs = 180_000 }: ProcessOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let closed = false;
    let killed = false;
    let result: ProcessResult;
    const killGroup = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try { process.kill(-child.pid, signal); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const finishTimeout = () => {
      if (closed && killed) {
        reject(new Error(`Process timed out after ${timeoutMs}ms: ${command}`, { cause: result }));
      }
    };
    let forceKill: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      // Keep this timer even if the group leader exits before its descendants.
      forceKill = setTimeout(() => {
        killGroup("SIGKILL");
        killed = true;
        finishTimeout();
      }, 2_000);
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      closed = true;
      result = {
        code, signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (timedOut) finishTimeout();
      else resolve(result);
    });
  });
}
