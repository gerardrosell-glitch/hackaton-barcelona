/**
 * server/site.js — the facts about this site, in one place.
 *
 * Every machine-readable surface the Coach publishes (llms.txt, agents.md, the
 * sitemap, the JSON-LD graph, the OpenAPI `info` block, the trust pages) has to
 * agree with the others, or an agent that cross-checks two of them concludes
 * neither is reliable. So they are all generated from this file.
 */

export const SITE = Object.freeze({
  name: "Quota Vita Nutrition Coach",
  shortName: "Quota Vita Coach",
  origin: "https://coach.quotavita.com",
  tagline: "A daily meal plan built around your body, your goal and today's training.",
  description:
    "Quota Vita Nutrition Coach turns a short profile — height, weight, age, goal and today's training — into a daily calorie and macronutrient target, three Catalan Mediterranean meals that meet it, a seven-day plan and a costed shopping basket. It runs in the browser, needs no account, and is free.",
  locale: "en",
  languages: ["en", "ca"],
  email: "hola@quotavita.com",
  shopUrl: "https://www.quotavita.com",
  chatUrl: "https://xat.quotavita.com",
  /** The last day this site's published content and contract changed. */
  updated: "2026-09-03",
});

export const ORGANISATION = Object.freeze({
  name: "Quota Vita",
  legalName: "Quota Vita",
  url: SITE.shopUrl,
  email: SITE.email,
  description:
    "Quota Vita is a Catalan food company in Premià de Mar, Barcelona. It makes Whey Crema Catalana protein powder and publishes free nutrition tools — the Nutrition Coach and a WhatsApp and web assistant — around it.",
  streetAddress: "Joan XXIII, 8",
  addressLocality: "Premià de Mar",
  addressRegion: "Barcelona",
  postalCode: "08330",
  addressCountry: "ES",
  areaServed: "ES",
  sameAs: ["https://www.quotavita.com", "https://xat.quotavita.com", "https://coach.quotavita.com"],
});

const url = (path) => `${SITE.origin}${path}`;

/**
 * The trust pages, the developer portal and the docs index.
 *
 * `markdown` is the source of truth: the HTML twin is generated from it, so the
 * two variants of a URL can never drift apart. `body` opens with the H1, which
 * is what an AI crawler reads first.
 */
export const PAGES = Object.freeze([
  {
    slug: "about",
    title: "About Quota Vita Nutrition Coach",
    description: "Who publishes the Coach, what it does, what it deliberately does not do, and how it is funded.",
    changefreq: "monthly",
    priority: "0.7",
    markdown: `# About Quota Vita Nutrition Coach

Quota Vita Nutrition Coach is a free web application published by **Quota Vita**, a food company in Premià de Mar, Barcelona, Catalonia (Spain). Quota Vita makes Whey Crema Catalana protein powder and sells it at [www.quotavita.com](https://www.quotavita.com). The Coach exists because the question customers actually asked was never "which tub should I buy" — it was "what should I eat today".

## What the Coach does

You answer a short profile: height, weight, age, sex, usual activity level, goal and what training you are doing today. From that the Coach calculates a daily energy target and a protein, carbohydrate and fat split, then proposes three meals — breakfast, lunch and dinner — drawn from familiar Catalan and Mediterranean cooking that add up to the target. You mark meals as eaten, photograph a restaurant plate instead of cooking, regenerate the day for something different, open a seven-day plan, and turn that week into a shopping basket with an estimated supermarket cost.

Everything runs in your browser. There is no account, no password and no sign-up. Your profile and your day live in your device's local storage, and clearing the site data removes them.

## What it does not do

The Coach is general wellbeing guidance, not medical treatment or clinical nutrition. It does not diagnose, does not manage allergies, pregnancy or a clinical condition, and does not replace a dietitian or a doctor. Photo analysis of a restaurant meal returns an editable suggestion, never a measurement. If you have a medical condition, ask a clinician before changing what you eat.

## How it is funded

There is no subscription and no advertising. One meal each day can optionally be met with a Batut Quota Vita, which is the company's own product and is priced in the shop. That link is the entire business model, and the Coach works exactly the same if you never use it.

Contact: [${SITE.email}](mailto:${SITE.email}). Developers and agents: [${url("/developers")}](${url("/developers")}).`,
  },
  {
    slug: "contact",
    title: "Contact Quota Vita",
    description: "How to reach Quota Vita about the Nutrition Coach, an order, or the public API — and what each channel is for.",
    changefreq: "monthly",
    priority: "0.6",
    markdown: `# Contact Quota Vita

Quota Vita is a small Catalan food company. One person answers most of what arrives, so say what you were doing and what you expected — it usually halves the conversation.

## Email

**[${SITE.email}](mailto:${SITE.email})** — the channel for everything: a question about the Nutrition Coach, an order from the shop, a bug you hit, a data request under the GDPR, or a question about the public API. This is the address to use if you only read one line of this page.

## The shop

Orders, shipping, returns and invoices are handled at **[www.quotavita.com](https://www.quotavita.com)**. Order status and delivery questions are fastest there, because the order number is what unlocks them.

## The assistant

**[xat.quotavita.com](https://xat.quotavita.com)** is the Quota Vita assistant, on the web and on WhatsApp. It answers product questions and takes orders in Catalan, Spanish and English without waiting for a human.

## For developers and AI agents

The Coach publishes a public, read-only, unauthenticated API and an OpenAPI 3.1 description of it. Start at the [developer portal](${url("/developers")}), or read [${url("/openapi.json")}](${url("/openapi.json")}) directly. Agent guidance, including when this site is the right one to call, is at [${url("/llms.txt")}](${url("/llms.txt")}) and [${url("/agents.md")}](${url("/agents.md")}).

## Postal address

Quota Vita
${ORGANISATION.streetAddress}
${ORGANISATION.postalCode} ${ORGANISATION.addressLocality}, ${ORGANISATION.addressRegion}
${ORGANISATION.addressCountry}

Full company and tax details appear on the invoice for every order.`,
  },
  {
    slug: "privacy",
    title: "Privacy at Quota Vita Nutrition Coach",
    description: "What the Coach stores, what it sends to which processor, what it never keeps, and how to erase it.",
    changefreq: "monthly",
    priority: "0.6",
    markdown: `# Privacy at Quota Vita Nutrition Coach

This page describes the Nutrition Coach at coach.quotavita.com. The shop at www.quotavita.com has its own policy. The controller is Quota Vita, ${ORGANISATION.addressLocality}, ${ORGANISATION.addressRegion} (${ORGANISATION.addressCountry}), reachable at [${SITE.email}](mailto:${SITE.email}).

## What stays on your device

Your profile — height, weight, age, sex, activity, goal — and your day's meals, points and language are stored in your browser's local storage. They are never sent to a Quota Vita server and there is no account holding them. Clearing this site's data in your browser deletes them permanently, and "Start over" in the Coach clears the plan.

## What leaves your device, and where it goes

- **Meal generation.** The daily and weekly plans are produced by OpenAI from your numeric target and today's training only. No name, no email, no device identifier. The request is sent with storage disabled, so it is not retained for model training.
- **Meal images.** The illustration on a meal card is generated by fal.ai from the meal title alone.
- **Live Coach chat.** What you type in the chat panel is sent to OpenAI to be answered, together with the recent turns of that conversation. Do not type anything you would not want processed by a third party.
- **Voice control.** Your browser turns speech into text; on most phones and desktops that transcription is done by the browser's own speech service, not by Quota Vita. The Coach then understands the common commands on your device, with nothing sent anywhere. Only a sentence it cannot place on its own is sent to OpenAI, together with what is on your screen — the plan, the day's remaining calories and macros — and the recent turns of the spoken conversation. No audio is recorded, sent or stored by Quota Vita, and voice cannot erase your data: that stays a confirmed choice on screen.
- **Restaurant photos.** A photo is analysed by LogMeal only after you tick the explicit authorisation on the upload dialog. The image is not stored by Quota Vita. The result is a suggestion you can edit, not a measurement.
- **Basket prices.** Estimated supermarket prices come from Cala. Only the food names and quantities in your basket are sent.
- **Email delivery.** If you ask for your week or your basket by email, your address and the checklist go to the Quota Vita email service at xat.quotavita.com, which sends the message. You have to consent on the form for anything to be sent.

## Usage counting

The Coach records anonymous product events — that a plan was generated, that a basket was created — against a random identifier generated in your browser. There is no email, no name, no profile and no nutrition or health value in that stream, and it is never used to build a picture of a person. It exists to answer whether the product is used at all.

## Cookies

The Coach sets no advertising or analytics cookies and runs no third-party tracker. Local storage is used for the purposes described above.

## Your rights

Write to [${SITE.email}](mailto:${SITE.email}) to ask what is held, to correct it, or to have it erased. Because the Coach holds no account, the fastest erasure for the Coach itself is clearing this site's data in your browser. You may also complain to the Agencia Española de Protección de Datos.`,
  },
  {
    slug: "developers",
    title: "Developer portal — Quota Vita Nutrition Coach",
    description: "The public API, the OpenAPI 3.1 specification, authentication, rate limits and example requests for the Quota Vita Nutrition Coach.",
    changefreq: "weekly",
    priority: "0.8",
    markdown: `# Developer portal

Everything on this page is public, read-only where it is unauthenticated, and needs no key.

## Machine-readable index

| Resource | URL |
| --- | --- |
| OpenAPI 3.1 (JSON) | [${url("/openapi.json")}](${url("/openapi.json")}) |
| OpenAPI 3.1 (YAML) | [${url("/api/openapi.yaml")}](${url("/api/openapi.yaml")}) |
| Agent instructions | [${url("/agents.md")}](${url("/agents.md")}) |
| llms.txt | [${url("/llms.txt")}](${url("/llms.txt")}) |
| Sitemap | [${url("/sitemap.xml")}](${url("/sitemap.xml")}) |
| Health check | [${url("/api/health")}](${url("/api/health")}) |

## Quickstart

Ask the Coach what Quota Vita may sell you, and how much milkshake covers a protein gap:

\`\`\`sh
curl -s "${SITE.origin}/api/shop?proteinG=30&days=28&language=en"
\`\`\`

Read the contract for every endpoint:

\`\`\`sh
curl -s ${SITE.origin}/openapi.json | jq '.paths | keys'
\`\`\`

Check the service is up before a batch of calls:

\`\`\`sh
curl -s ${SITE.origin}/api/health
\`\`\`

Every page on this site is also Markdown. Ask for it by \`Accept\` header, per [acceptmarkdown.com](https://acceptmarkdown.com):

\`\`\`sh
curl -s -H 'Accept: text/markdown' ${SITE.origin}/developers
\`\`\`

## Authentication

The read endpoints — \`GET /api/health\`, \`GET /api/shop\`, \`GET /openapi.json\` — take no credentials and no key. The generative and delivery endpoints (\`POST /api/coach-chat\`, \`POST /api/daily-meals\`, \`POST /api/meal-image\`, \`POST /api/meal-photo\`, \`POST /api/shopify-email\`) are served for the Coach's own front end; they need no user key either, but they are backed by paid third-party providers and return \`503\` with a \`service_not_configured\` code where a provider is not enabled. Treat them as best-effort, not as a contracted API.

## Errors

Every error is JSON, with the same envelope on every route:

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

\`error\` and \`message\` always carry the same human-readable sentence. \`code\` is a stable snake_case identifier — branch on that, never on the sentence. \`hint\` says what to do next.

## Rate limits and fair use

There is no published quota and no key to throttle. Keep it to a few requests a second, cache \`/api/shop\` for the hour it advertises in its \`Cache-Control\`, and take \`/openapi.json\` once rather than on every call. Sustained abusive traffic is blocked at the edge.

## Sandbox

There is no separate sandbox host. \`GET /api/health\` and \`GET /api/shop\` are safe to call repeatedly: they are read-only, they cost nothing and they touch no personal data. Use them to check your integration end to end.

## Questions

[${SITE.email}](mailto:${SITE.email}).`,
  },
  {
    slug: "docs",
    title: "Documentation — Quota Vita Nutrition Coach",
    description: "Index of the Quota Vita Nutrition Coach documentation: API reference, agent instructions, and the trust pages.",
    changefreq: "weekly",
    priority: "0.6",
    markdown: `# Documentation

The Quota Vita Nutrition Coach documentation is short enough to list on one page.

## For developers

- [Developer portal](${url("/developers")}) — quickstart, authentication, errors, rate limits and the sandbox.
- [OpenAPI 3.1, JSON](${url("/openapi.json")}) — the full contract. Also as [YAML](${url("/api/openapi.yaml")}).
- [Health check](${url("/api/health")}) — service status and the version of the published contract.

## For AI agents

- [llms.txt](${url("/llms.txt")}) — what this site is, when to use it, and how to call it, in the [llmstxt.org](https://llmstxt.org) format.
- [agents.md](${url("/agents.md")}) — the long form of the same guidance, including when *not* to use this site.
- Every page is also served as \`text/markdown\` by \`Accept\` negotiation, per [acceptmarkdown.com](https://acceptmarkdown.com).

## About the service

- [About](${url("/about")}) — what the Coach does and what it deliberately does not do.
- [Contact](${url("/contact")}) — the channels, and what each is for.
- [Privacy](${url("/privacy")}) — what is stored, what is sent to which processor, and how to erase it.

## The Coach itself

The application lives at [${SITE.origin}/](${SITE.origin}/). It needs no account: answer the profile questions and the first daily plan appears.`,
  },
]);

export const pageBySlug = (slug) => PAGES.find((page) => page.slug === slug) ?? null;

/** Every indexable URL, for the sitemap and for the llms.txt page list. */
export const SITEMAP_ENTRIES = Object.freeze([
  { path: "/", title: SITE.name, description: SITE.tagline, changefreq: "weekly", priority: "1.0" },
  ...PAGES.map((page) => ({
    path: `/${page.slug}`,
    title: page.title,
    description: page.description,
    changefreq: page.changefreq,
    priority: page.priority,
  })),
]);
