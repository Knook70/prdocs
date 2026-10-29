import config from "../../prdocs.config.ts";
import { runBuild } from "./vite/builder.ts";
import { runDevelopment } from "./vite/server.ts";

try {
  const runsByMode = new Map<string, () => Promise<void>>([
    [config.build.modes.production, runBuild],
    [config.build.modes.development, runDevelopment],
  ]);
  const mode = process.argv[2];
  const run = runsByMode.get(mode ?? "");

  if (!run) {
    throw new Error(
      `Run node src/site-build/run.ts <${[...runsByMode.keys()].join("|")}>.`,
    );
  }

  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
