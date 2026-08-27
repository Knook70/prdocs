export type HeadDefinition = {
  tag: string;
  attributes?: Record<string, unknown>;
  valueAttribute?: string;
  default?: unknown | ((filename: string) => unknown);
};

export default {
  html: {
    lang: "und",
  },
  head: {
    title: {
      tag: "title",
      default: (filename: string) => filename,
    },
    description: {
      tag: "meta",
      attributes: {
        id: "document-description",
        name: "description",
      },
      valueAttribute: "content",
      default: "document",
    },
  },
} satisfies {
  html: { lang: unknown };
  head: Record<string, HeadDefinition>;
};
