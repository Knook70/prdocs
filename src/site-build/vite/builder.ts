import { build } from "vite";
import { viteConfig } from "./config.ts";
import { createStagingPlugin } from "./plugin.ts";

export async function runBuild(): Promise<void> {
  await using plugin = await createStagingPlugin();
  await build({ ...viteConfig, plugins: [plugin] });
}
