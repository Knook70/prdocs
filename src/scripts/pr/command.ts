import { spawnSync } from "node:child_process";

type CommandOutput<T extends "pipe" | "inherit"> = T extends "pipe"
  ? string
  : void;

export function runCommand<T extends "pipe" | "inherit">(
  command: string,
  args: readonly string[],
  stdio: T,
): CommandOutput<T> {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string"
      ? result.stderr.trim()
      : "";
    const message = stderr
      ? stderr
      : result.signal
        ? `Command was terminated by ${result.signal}.`
        : `Command exited with code ${result.status}.`;
    throw new Error(message);
  }

  const stdout = typeof result.stdout === "string"
    ? result.stdout.trim()
    : "";
  return (stdio === "pipe" ? stdout : undefined) as CommandOutput<T>;
}
