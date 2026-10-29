import { mkdtempDisposableSync } from "node:fs";
import { glob } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";
import packageJson from "../../../package.json" with { type: "json" };
import config from "../../../prdocs.config.ts";
import { Staging } from "../content/build.ts";
import { projectRoot } from "./config.ts";

const sourceEvents = {
  create: "add",
  update: "change",
  delete: "unlink",
} as const;

export async function createStagingPlugin(): Promise<Plugin & AsyncDisposable> {
  await using resources = new AsyncDisposableStack();
  const staging = resources.use(
    mkdtempDisposableSync(join(tmpdir(), `${packageJson.name}-`)),
  );
  const sourceRoot = resolve(projectRoot, config.site.documentSourceRoot);
  const content = new Staging({ sourceRoot, outputRoot: staging.path });
  resources.defer(() => content.close());

  await content.init();

  const lifetime = resources.move();
  const dispose = () => lifetime.disposeAsync();

  return {
    name: "prdocs-staging",
    async config(_config, { command }) {
      return {
        root: staging.path,
        server: { fs: { allow: [projectRoot, staging.path] } },
        ...(command === "build" ? {
          build: {
            rolldownOptions: {
              input: await Array.fromAsync(
                glob("**/*.html", { cwd: staging.path }),
                (file) => resolve(staging.path, file),
              ),
            },
          },
        } : {}),
      };
    },
    configureServer(server) {
      server.watcher.add(sourceRoot);

      const stop = () => {
        void server.close().catch((error) => {
          server.config.logger.error(String(error));
          process.exitCode = 1;
        });
      };
      process.once("SIGINT", stop);
      lifetime.defer(() => {
        process.off("SIGINT", stop);
      });
    },
    watchChange(sourcePath, { event }) {
      if (lifetime.disposed) return;

      const sourceRelativePath = relative(sourceRoot, sourcePath);
      if (
        sourceRelativePath === "" ||
        sourceRelativePath === ".." ||
        sourceRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(sourceRelativePath)
      ) return;

      return content.update(sourceEvents[event], sourcePath);
    },
    closeBundle: dispose,
    [Symbol.asyncDispose]: dispose,
  };
}
