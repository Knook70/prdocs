import { defineConfig } from "vite";
import { join } from "node:path";

const projectRoot = import.meta.dirname;

export default defineConfig({
  appType: "mpa",
  cacheDir: join(projectRoot, "node_modules", ".vite"),
  envDir: projectRoot,
  publicDir: join(projectRoot, "public"),
  resolve: {
    alias: {
      "/src": join(projectRoot, "src"),
    },
  },
  server: {
    fs: {
      allow: [projectRoot],
    },
    watch: {
      ignored: ["**/*.html"],
    },
  },
});
