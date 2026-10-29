import type { PrdocsConfig } from "./types/prdocs.config.types.ts";

const config = {
  site: {
    documentSourceRoot: "src/documents",
    sourceDocument: {
      extension: ".md",
      ignoredFilenamePrefix: "_",
    },
    documentUrl: {
      extension: ".html",
    },
  },
  build: {
    modes: {
      production: "build",
      development: "dev",
    },
    outputRoot: "dist",
    document: {
      template: "src/site-build/document.template.html",
      defaults: {
        language: "und",
        description: "document",
      },
    },
  },
  pullRequest: {
    sourceRepository: {
      hostname: "github.com",
      nameWithOwner: "Knook70/prdocs",
      baseBranch: "main",
    },
    kinds: {
      documents: {
        option: "--docs",
        prBranchPrefix: "docs/",
      },
      development: {
        option: "--dev",
        prBranchPrefix: "dev/",
      },
    },
    documentPR: {
      documentSourceRoot: "src/documents",
      authorDirectoryPrefix: "@",
      allowedExtensions: [".md"],
    },
  },
} satisfies PrdocsConfig;

export default config;
