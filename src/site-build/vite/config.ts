import { resolve } from "node:path";
import type { InlineConfig } from "vite";
import config from "../../../prdocs.config.ts";

export const projectRoot = resolve(import.meta.dirname, "../../..");

export const viteConfig = {
  configFile: false,
  appType: "mpa",
  publicDir: false,
  envDir: projectRoot,
  cacheDir: resolve(projectRoot, "node_modules/.vite"),
  resolve: {
    alias: {
      "/src/client": resolve(projectRoot, "src/client"),
    },
  },
  build: {
    outDir: resolve(projectRoot, config.build.outputRoot),
    emptyOutDir: true,
  },
} satisfies InlineConfig;
