/**
 * server/not-found.js — the body of a 404.
 *
 * A 404 is where an agent most needs help and usually gets least: a status code
 * and nothing else, so the only recovery left is guessing another URL. This is
 * a short Markdown map instead — where the index of URLs is, where the API
 * contract is, and what the site actually holds.
 */

import { SITE, PAGES } from "./site.js";

const url = (path) => `${SITE.origin}${path}`;

export function notFoundMarkdown(path) {
  const requested = path ? `\`${String(path).slice(0, 200).replace(/`/g, "")}\`` : "The requested path";

  return `# 404 — Not found

${requested} does not exist on ${SITE.origin}, and never did. This is a real \`404\`: every path that returns \`200\` here is a path that exists.

## Where to look next

- [/sitemap.xml](${url("/sitemap.xml")}) — every indexable URL on this site, with its last-modified date.
- [/llms.txt](${url("/llms.txt")}) — what this site is, when to use it, and how to call it.
- [/agents.md](${url("/agents.md")}) — the long form of the same guidance.
- [/openapi.json](${url("/openapi.json")}) — the full API contract. If you were guessing at an endpoint, the answer is here.
- [/docs](${url("/docs")}) — the documentation index.
- [/developers](${url("/developers")}) — quickstart, authentication, errors and rate limits.

## The pages that do exist

- [${SITE.name}](${SITE.origin}/) — the Coach itself.
${PAGES.map((page) => `- [/${page.slug}](${url(`/${page.slug}`)}) — ${page.description}`).join("\n")}

## If you were calling the API

Every endpoint lives under \`/api/\` and is listed in [the OpenAPI document](${url("/openapi.json")}). Unknown paths under \`/api/\` answer with a JSON error carrying \`code: not_found\`, not with this page.
`;
}
