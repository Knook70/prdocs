import { basename } from "node:path";
import matter from "gray-matter";
import { parse } from "marked";
import config, { type HeadDefinition } from "../src/build.config.ts";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function headElement(
  definition: HeadDefinition,
  value: unknown,
): string {
  const attributes = { ...definition.attributes };

  if (definition.valueAttribute) {
    attributes[definition.valueAttribute] = value;
  }

  const attributesHtml = Object.entries(attributes)
    .map(([name, attribute]) => ` ${name}="${escapeHtml(attribute)}"`)
    .join("");
  const openingTag = `<${definition.tag}${attributesHtml}>`;
  return definition.valueAttribute
    ? openingTag
    : `${openingTag}${escapeHtml(value)}</${definition.tag}>`;
}

export function renderDocument(
  markdown: string,
  relativePath: string,
): string {
  const { data, content } = matter(markdown);
  const filename = basename(relativePath, ".md");
  const head = [];

  for (const [key, definition] of Object.entries<HeadDefinition>(config.head)) {
    const value =
      data[key] ??
      (typeof definition.default === "function"
        ? definition.default(filename)
        : definition.default);
    if (value == null) continue;

    head.push(headElement(definition, value));
  }

  return `<!doctype html>
<html lang="${escapeHtml(data.lang ?? config.html.lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${head.join("\n    ")}
  <script type="module" src="/src/client/main.ts"></script>
</head>
<body>
  <main>
    <article id="document">${parse(content)}</article>
  </main>
</body>
</html>
`;
}
