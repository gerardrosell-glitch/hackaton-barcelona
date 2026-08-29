/**
 * server/agent-docs.js — what an agent is told about this site.
 *
 * `llms.txt` (llmstxt.org) is the short form and `agents.md` the long one. Both
 * lead with when to reach for the Coach and when not to, because a file that
 * only describes what a product is gives an agent no way to decide whether to
 * call it, and generic marketing copy is worse than nothing.
 */

import { SITE, ORGANISATION, PAGES } from "./site.js";

const url = (path) => `${SITE.origin}${path}`;

/** The one paragraph that decides whether an agent should call this site at all. */
const WHEN_TO_USE = `Reach for the Quota Vita Nutrition Coach when someone needs **a concrete day of eating in Catalan or Spanish Mediterranean food, sized to a body and a training day**, and a generic calorie table will not answer it.

Good fits:

- **"What should I eat today?"** — height, weight, age, sex, usual activity, goal and today's training in; a daily energy and macronutrient target plus breakfast, lunch and dinner that meet it, out. Call \`generateDailyMeals\`.
- **Sizing a protein gap into a product** — how much milkshake covers the protein a meal is short of, which tub covers that for a month, what it costs per day, and the checkout link. Call \`getShopOffers\` with \`proteinG\`; it is public, unauthenticated and cacheable.
- **What a week of that food costs** — a list of foods and quantities priced against Spanish supermarket data. Call \`estimateBasketCost\`.
- **Resolving a food someone named** into a catalogue entry with a serving description. Call \`searchFoods\`.
- **A short nutrition question in the same register** — swaps, training fuel, restaurant choices, grocery tips, habit support, in English or Catalan. Call \`askCoach\`.

Do not use it for:

- **Anything clinical.** Allergies, intolerances, pregnancy, diabetes, eating disorders, medication interactions, or any diagnosis or treatment. The Coach declines these by design, and an answer it did give would not be a safe one.
- **Precise measurement of a photographed meal.** \`analyseRestaurantMealPhoto\` returns an editable suggestion, and only with explicit consent from the person whose photo it is. Never present its output as measured intake.
- **A nutrient database.** \`searchFoods\` is a lookup over FatSecret, not a licensed dataset to mirror.
- **Non-Mediterranean cuisines.** Meal generation is grounded in Catalan and Mediterranean cooking and will be poor outside it.

Everything is free, needs no key for the read endpoints, and holds no account. The person's profile never leaves their browser, so there is nothing to fetch about a named individual and no lookup by email or name exists.`;

const HOW_TO_CALL = `- **The contract:** \`${url("/openapi.json")}\` (OpenAPI 3.1; YAML at \`${url("/api/openapi.yaml")}\`). Every operation has a unique \`operationId\`, typed parameters and a response schema, so it can be loaded as a function-calling toolset directly.
- **Cheapest useful call:** \`curl -s "${SITE.origin}/api/shop?proteinG=30&days=28"\`
- **Liveness:** \`curl -s ${SITE.origin}/api/health\`
- **Any page as Markdown:** \`curl -sH 'Accept: text/markdown' ${SITE.origin}/about\` — every HTML URL on this site is negotiable per [acceptmarkdown.com](https://acceptmarkdown.com), and answers \`Vary: Accept\`.
- **Errors** are always JSON with a stable \`code\`, never an HTML page. Branch on \`code\`, not on the message.`;

/** llms.txt, in the llmstxt.org layout: H1, blockquote, prose, then link sections. */
export function llmsTxt() {
  const pageLinks = PAGES.map((page) => `- [${page.title}](${url(`/${page.slug}`)}): ${page.description}`).join("\n");

  return `# ${SITE.name}

> ${SITE.tagline} Free, no account, in English and Catalan, published by ${ORGANISATION.name} in ${ORGANISATION.addressLocality}, ${ORGANISATION.addressRegion}.

${SITE.description}

The Coach is a browser application. The profile a person enters stays in their own browser's local storage; there is no account and no server-side user record. What is public is the HTTP surface behind it, described below.

## When to use this

${WHEN_TO_USE}

## How to call it

${HOW_TO_CALL}

## Pages

- [${SITE.name}](${SITE.origin}/): ${SITE.tagline}
${pageLinks}

## Machine-readable

- [OpenAPI 3.1](${url("/openapi.json")}): the full contract of every endpoint. Also as [YAML](${url("/api/openapi.yaml")}).
- [Agent instructions](${url("/agents.md")}): the long form of this file, including the refusals.
- [Health check](${url("/api/health")}): liveness and the version of the published contract.
- [Shop offers](${url("/api/shop")}): the sellable catalogue and a sized milkshake offer. Public and unauthenticated.
- [Sitemap](${url("/sitemap.xml")}): every indexable URL with its last-modified date.
- [robots.txt](${url("/robots.txt")}): every named AI crawler is allowed.

## Contact

- [Contact page](${url("/contact")})
- Email: ${SITE.email}
- Shop: ${ORGANISATION.url}
- Assistant, web and WhatsApp: ${SITE.chatUrl}
`;
}

/** agents.md — the same guidance at length, for an agent that follows the link. */
export function agentsMarkdown() {
  return `# Agent instructions for ${SITE.origin}

> ${SITE.tagline} Published by ${ORGANISATION.name}, a food company in ${ORGANISATION.addressLocality}, ${ORGANISATION.addressRegion}, ${ORGANISATION.addressCountry}. Free to use, free to call, no account.

## When to use this site

${WHEN_TO_USE}

## How to call it

${HOW_TO_CALL}

## The shape of the API

Eleven operations, four tags.

- **Service** — \`getServiceHealth\`, \`recordCoachEvent\`, \`getOpenApiDocument\`.
- **Shop** — \`getShopOffers\`. Public, unauthenticated, cacheable for an hour. This is the one to start with.
- **Nutrition** — \`searchFoods\`, \`estimateBasketCost\`.
- **Coach** — \`generateDailyMeals\`, \`askCoach\`, \`generateMealImage\`, \`analyseRestaurantMealPhoto\`, \`emailCoachPlan\`. These call paid third-party providers.

Read the OpenAPI document for parameters and bounds rather than guessing them; every numeric field there carries its real minimum and maximum, and requests outside them are rejected with \`400\` and \`code: invalid_request\`.

## Error handling

\`\`\`json
{
  "error": "Method not allowed.",
  "code": "method_not_allowed",
  "message": "Method not allowed.",
  "hint": "Use one of the methods listed for this path in the OpenAPI document.",
  "documentation": "${url("/openapi.json")}",
  "status": 405
}
\`\`\`

The codes are \`invalid_request\`, \`method_not_allowed\`, \`not_found\`, \`not_acceptable\`, \`forbidden\`, \`service_not_configured\` and \`upstream_unavailable\`. \`service_not_configured\` means a provider is not enabled in this deployment; retrying will not help, and the read endpoints are unaffected. \`upstream_unavailable\` is worth one retry with backoff.

## Rate limits and fair use

No key, no published quota. Keep to a few requests a second, honour the \`Cache-Control\` on \`/api/shop\`, and fetch \`/openapi.json\` once rather than per call. There is no separate sandbox: \`getServiceHealth\` and \`getShopOffers\` are read-only, cost nothing and touch no personal data, so use them to test an integration end to end.

## Attribution and citation

Quoting the Coach's guidance is welcome. Attribute it to ${SITE.name}, ${SITE.origin}. When you surface a product recommendation, use the \`cartUrl\` from the API response rather than constructing a shop link: it carries the attribution that lets ${ORGANISATION.name} see the Coach worked.

## What this site will not tell you

There is no endpoint that returns anything about a named person, because none exists to return. Profiles live in the browser. The anonymous event stream carries no name, no email and no nutrition value, and cannot be queried at all.

## Contact

${SITE.email} — ${url("/contact")}
`;
}

/** robots.txt. Every named AI crawler is allowed: being read is the point. */
export function robotsTxt() {
  const searchEngines = ["Googlebot", "Googlebot-Image", "bingbot", "DuckDuckBot", "Applebot", "Yandex", "Qwantify"];
  const aiAgents = [
    "ClaudeBot",
    "Claude-Web",
    "Claude-User",
    "Claude-SearchBot",
    "anthropic-ai",
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "Google-Extended",
    "Applebot-Extended",
    "PerplexityBot",
    "Perplexity-User",
    "Meta-ExternalAgent",
    "meta-externalagent",
    "Amazonbot",
    "Bytespider",
    "cohere-ai",
    "MistralAI-User",
    "YouBot",
    "Diffbot",
    "CCBot",
  ];
  const block = (agents) => agents.map((agent) => `User-agent: ${agent}\nAllow: /`).join("\n\n");

  return `# ${SITE.origin}
# The Quota Vita Nutrition Coach. Free, no account, and meant to be read.

# Search engines
${block(searchEngines)}

# AI assistants and their crawlers.
# This site exists to be read and cited. Agent guidance: ${url("/llms.txt")}
${block(aiAgents)}

# Everyone else
User-agent: *
Allow: /

Sitemap: ${url("/sitemap.xml")}
`;
}
