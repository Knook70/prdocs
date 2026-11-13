export type PrdocsConfig = Readonly<{
  site: Readonly<{
    documentSourceRoot: string;
    sourceDocument: Readonly<{
      extension: string;
      ignoredFilenamePrefix: string;
    }>;
    documentUrl: Readonly<{
      extension: string;
    }>;
  }>;
  build: Readonly<{
    modes: Readonly<{
      production: string;
      development: string;
    }>;
    outputRoot: string;
    document: Readonly<{
      template: string;
      defaults: Readonly<{
        language: string;
        description: string;
      }>;
    }>;
  }>;
  pullRequest: Readonly<{
    sourceRepository: Readonly<{
      hostname: string;
      nameWithOwner: string;
      baseBranch: string;
    }>;
    kinds: Readonly<{
      documents: Readonly<{
        prBranchPrefix: string;
      }>;
      development: Readonly<{
        prBranchPrefix: string;
      }>;
    }>;
    documentPR: Readonly<{
      documentSourceRoot: string;
      authorDirectoryPrefix: string;
      allowedExtensions: readonly string[];
    }>;
  }>;
}>;
