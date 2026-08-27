import {
  globSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { renderDocument } from "./renderer.ts";

export function syncDocuments(
  documentRoot: string,
  stagingRoot: string,
): void {
  const documents = globSync("**/*.md", { cwd: documentRoot }).map(
    (relativePath) => ({
      outputPath: relativePath.replace(/\.md$/, ".html"),
      html: renderDocument(
        readFileSync(join(documentRoot, relativePath), "utf8"),
        relativePath,
      ),
    }),
  );

  for (const relativePath of globSync("**/*.html", { cwd: stagingRoot })) {
    rmSync(join(stagingRoot, relativePath));
  }

  for (const { outputPath, html } of documents) {
    const destination = join(stagingRoot, outputPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, html);
  }
}
