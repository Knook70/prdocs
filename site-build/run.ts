import { globSync, mkdtempDisposableSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { build, createServer } from "vite";
import { syncDocuments } from "./builder.ts";

const projectRoot = dirname(import.meta.dirname);
const documentRoot = join(projectRoot, "src", "documents");
const outputRoot = join(projectRoot, "dist");
const configFile = join(projectRoot, "vite.config.ts");
const mode = process.argv[2];

if (mode !== "build" && mode !== "dev") {
  throw new Error("Usage: node site-build/run.ts <build|dev>");
}

function isDocument(file: string): boolean {
  const relativePath = relative(documentRoot, file);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath) &&
    relativePath.endsWith(".md")
  );
}

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

using staging = mkdtempDisposableSync(join(tmpdir(), "portfolio-md-"));
syncDocuments(documentRoot, staging.path);

const viteConfig = {
  configFile,
  root: staging.path,
  server: {
    fs: {
      allow: [projectRoot, staging.path],
    },
  },
};

if (mode === "build") {
  await build({
    ...viteConfig,
    build: {
      emptyOutDir: true,
      outDir: outputRoot,
      rolldownOptions: {
        input: globSync("**/*.html", { cwd: staging.path }).map((file) =>
          join(staging.path, file),
        ),
      },
    },
  });
} else {
  const server = await createServer(viteConfig);

  server.watcher.add(documentRoot);
  server.watcher.on("all", (event, file) => {
    if (
      (event !== "add" && event !== "change" && event !== "unlink") ||
      !isDocument(file)
    ) {
      return;
    }

    try {
      syncDocuments(documentRoot, staging.path);
      server.ws.send({ type: "full-reload" });
    } catch (error) {
      server.config.logger.error(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
    }
  });

  try {
    await server.listen();
    server.printUrls();
    await waitForShutdown();
  } finally {
    await server.close();
  }
}
