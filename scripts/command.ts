import { spawnSync, type SpawnSyncOptions } from "node:child_process";

type CommandOutput<T extends "utf8" | "buffer" | "inherit"> =
  T extends "utf8" ? string : T extends "buffer" ? Buffer : void;

export function runCommand<T extends "utf8" | "buffer" | "inherit">(
  command: string,
  args: readonly string[],
  output: T,
  options: Omit<SpawnSyncOptions, "encoding" | "stdio"> = {},
): CommandOutput<T> {
  const result = spawnSync(command, args, {
    ...options,
    encoding: output === "utf8" ? "utf8" : "buffer",
    stdio: output === "inherit" ? "inherit" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim() ?? "";
    throw new Error(stderr || (result.signal
      ? `Command was terminated by ${result.signal}.`
      : `Command exited with code ${result.status}.`));
  }
  return (output === "inherit" ? undefined : result.stdout) as CommandOutput<T>;
}
