import { createServer, type ViteDevServer } from "vite";
import { viteConfig } from "./config.ts";
import { createStagingPlugin } from "./plugin.ts";

export async function runDevelopment(): Promise<void> {
  const plugin = await createStagingPlugin();
  let server: ViteDevServer | undefined;

  try {
    server = await createServer({ ...viteConfig, plugins: [plugin] });
    await server.listen();
    server.printUrls();
  } catch (error) {
    try {
      await server?.close();
    } finally {
      await plugin[Symbol.asyncDispose]();
    }
    throw error;
  }
}
