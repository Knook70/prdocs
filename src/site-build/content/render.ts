import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { parse as parsePath } from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import config from "../../../prdocs.config.ts";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => HTML_ENTITIES[character]!
  );
}

export async function renderDocument(sourcePath: string): Promise<string> {
  const markdown = await readFile(sourcePath, "utf8");
  const template = readFileSync(
    new URL(`../../../${config.build.document.template}`, import.meta.url),
    "utf8",
  );
  const defaults = config.build.document.defaults;
  const { data, content } = matter(markdown, {
    engines: {
      javascript() {
        throw new Error("Executable frontmatter is not supported.");
      },
    },
  });

  const slots = new Map<string, string>([
    ["language", escapeHtml(String(data.lang ?? defaults.language))],
    ["title", escapeHtml(String(data.title ?? parsePath(sourcePath).name))],
    ["description", escapeHtml(String(data.description ?? defaults.description))],
    ["document", marked.parse(content, { async: false })],
  ]);

  return template.replace(
    /\{\{([^{}]*)\}\}/g,
    (_slot: string, name: string): string => slots.get(name.trim()) ?? "",
  );
}
