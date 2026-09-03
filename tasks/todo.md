# A Catalan voice for the Coach — 2026-09-03

Prompted by BSC-LT's Catalan speech work. Two corrections to the obvious reading of it.
`catalan-verification-model-pkt-a`, the model in the video, is a *verification* model — it runs
paired with `-pkt-b` to cross-check transcriptions when labelling training data — so it is not
something to point a microphone at. And recognition was not the broken half: Chrome and iOS both
do `ca-ES` dictation already. What is broken is the other direction. Most phones ship no Catalan
`speechSynthesis` voice, so the Coach reads its Catalan aloud in Spanish.

- [x] Gather every sentence the Coach speaks without a live number into one catalogue.
- [x] Add `scripts/build-catalan-voice.mjs` to render that catalogue with Matxa (Projecte Aina).
- [x] Play a rendered sentence when one exists; fall through to the device voice when it does not.
- [x] Cache `/audio/` in the service worker so Catalan survives offline.
- [x] Guard the exact-text lookup with tests, including that the app-composed replies still
      appear verbatim in `coach.js`.
- [x] Verify playback and the no-recordings fallback in a browser.
- [ ] Render the real audio: `HF_TOKEN=hf_… npm run voice:ca`, then commit `public/audio/ca/`.
      This environment cannot reach `huggingface.co`, so the pipeline is written and tested
      against placeholder audio but no real recording exists yet.
- [ ] Listen to the thirty-six before committing them. Check the numbers-free sentences read
      naturally at speed, and that "Refaig el pla" and "T'escolto" are not clipped.
- [ ] Decide the variety. The script defaults to `central` via `MATXA_VOICE`; Matxa also covers
      north-western, Balearic and Valencian.

### Review

The decision worth recording is what was *not* built. A live ASR or TTS endpoint would have put
a customer's voice, or every reply, through `us-east-1` — against the README's own EU-region
rule and the `fra1` pin in `vercel.json` — added seconds to a loop that needs to feel immediate,
and made the privacy page's "no audio is recorded, sent or stored" false. Pre-rendering has none
of those costs: it is a build step whose input is the app's own copy and whose output is a file.

The catalogue is thirty-six sentences because that is genuinely all the Coach says on its own.
Six more carry live numbers and cannot be pre-rendered; they keep the device voice, as does
everything until the audio is generated. The lookup is by exact text, which is fast and needs no
hashing in the browser but fails silently on a one-character edit — so the tests assert the
grammar's own confirmations are all in the catalogue, and that each app-composed reply still
appears verbatim in `coach.js`. Breaking one phrase by two characters was confirmed to fail the
suite before this was called done.

Browser-verified both ways: with recordings present, "ves a la cistella" and "he dinat" played
files while "què em queda" synthesised its numbers; with `public/audio/` removed entirely,
everything fell through to the synthesiser with no errors. That second state is how this ships.

# Voice control — 2026-09-03

- [x] Add a shared voice-command grammar with a strict action allow-list and typed arguments.
- [x] Match the common English and Catalan commands on the device, with no network call.
- [x] Add `/api/voice` for the sentences and questions the grammar cannot place.
- [x] Add a hands-free browser panel: microphone, live transcript, spoken reply, listen again.
- [x] Reach every screen, meal log, training choice, basket read-out and setup answer by voice.
- [x] Keep data erasure out of the voice catalogue.
- [x] Fall back to a text field where the browser has no speech recognition.
- [x] Cache the voice modules in the service-worker shell so commands work offline.
- [x] Disclose voice on the privacy page and publish `/api/voice` in the OpenAPI contract.
- [x] Verify the flow in a real browser at phone and desktop widths.
- [ ] Verify on a physical iPhone and Android handset, where the microphone permission and the
      installed speech voices are real. Catalan synthesis is not present on every device; the
      controller falls back to a Spanish voice, which needs a listen before release.
- [ ] Deploy to `coach.quotavita.com`. This has to run from a machine linked to the Vercel
      project: `.vercel/` is gitignored, so a fresh clone has no `orgId`/`projectId`, and the
      project is not wired to GitHub — there has never been a GitHub deployment on this repo, so
      merging to `main` ships nothing on its own.

      ```sh
      git fetch origin && git checkout claude/coac-quotavita-voice-control-o5uqxr
      npm test                       # 28 tests
      npx vercel@latest deploy --prod
      ```

- [ ] After the deploy, three things to confirm, in this order.

      1. **The cross-tree import survived bundling.** `api/voice.js` and `server/openapi.js` both
         import `../public/voice-commands.js` — the shared grammar lives in `public/` because that
         is the only directory the browser can reach, and it is the one import crossing from a
         function into the static tree. If Vercel's tracer dropped it, both routes 500 at cold
         start. One call proves both:

         ```sh
         curl -s https://coach.quotavita.com/openapi.json | grep -c interpretSpokenCommand   # expect 1
         curl -s -X POST https://coach.quotavita.com/api/voice \
           -H 'Content-Type: application/json' \
           -d '{"transcript":"what should I eat before a long run","language":"en"}'
         ```

         The second should return `{"say": "...", "actions": [...]}`. A `503
         service_not_configured` means `OPENAI_API_KEY` is missing from the Vercel environment,
         not that the import failed.

      2. **Direct commands work with no key at all.** They never reach the server, so
         `coach.quotavita.com` → microphone → "open my basket" should navigate even in aeroplane
         mode once the service worker has the shell.

      3. **A real handset.** The microphone permission prompt, and the speech voices, only exist
         on a real device. Catalan synthesis is not installed on every phone; the controller falls
         back to a Spanish voice, which needs a listen before this is called done.
- [ ] Run the new Catalan copy through Softcatalà. The corrector was unreachable from the build
      environment (the egress policy refuses `softcatala.org`), so the spoken Catalan shipped on a
      manual pass only: tractament de tu throughout, `proteïna` with the dieresi, no *sóc*, *tenir
      que*, *bueno*, *vale*, *suero* or *tamany*, and no claim that the whey comes from Catalan
      cheese factories. It still needs the machine check.
- [ ] Separately: `public/coach.js` line 360 carries a pre-existing "Hola, sóc el teu Coach" in the
      Catalan dictionary. The brand rule is *soc*, without the diacritic, per IEC 2017. Left
      untouched here because it is not part of this change.

### Review

Voice is a third way to drive the same app, beside the tab bar and the search panel, and it
reuses their functions rather than owning copies. `applyTraining` and `remainingToday` were
extracted for exactly that reason: choosing today's movement and reading what is left of the
day now have one definition each, used by the screen and by the microphone.

Every sentence is tried against `public/voice-commands.js` on the device first. That file is
also what `api/voice.js` validates the model's output against, so the offline path and the
model path cannot drift. Fifteen actions exist; erasing data is deliberately not one of them.

Local browser verification at 390 px and 1280 px: the microphone opens the panel, `v` opens it
from the keyboard, Escape and "stop" close it, and typed commands drove navigation to the
basket, a run set for the day, lunch logged, the basket and the remaining macros read aloud,
and the dinner card read out with its ingredients. With no microphone available the panel
showed the permission message and stayed usable by typing. `npm test` passes 26 tests, ten of
them new.

# Nutrition Coach interaction update

- [x] Replace the fixed desktop meal-board width and image height with viewport-aware sizing.
- [x] Preserve the mobile swipe deck while allowing desktop photos and cards to scale with the screen.
- [x] Verify the daily plan at compact and wide desktop viewports without horizontal overflow.
- [x] Remove the excess desktop inset above the daily plan and condense the Coach introduction.
- [x] Replace the mobile inline Coach panel with a compact, collapsible conversation drawer.
- [x] Verify the mobile swipe deck remains unobscured until the conversation control is opened.
- [x] Replace the repeated basket price-source labels with one average-supermarket reference beneath the weekly cost title.
- [x] Render the seven-day plan as a full-width responsive desktop gallery.
- [x] Generate and cache each weekly day image automatically through the Fal meal-image route.
- [x] Add a touch-event fallback and lower swipe threshold for mobile daily meals.
- [x] Standardise Coach action buttons so daily meal actions stay aligned on phone and desktop.
- [ ] Move the daily and weekly plan actions into labelled groups above the desktop meal board, with training and reset in a separate lower row.
- [x] Replace the large daily/weekly action panel with compact controls in the top navigation beside Start over.
- [x] Add an optional compact plan view: title-only daily and weekly cards expand with a Details button.
- [x] Keep phone plan controls in a contained Plan drawer, with meal actions unobscured inside their cards.
- [ ] Verify the weekly gallery, seven automatic Fal requests, mobile swiping, and action-button alignment.
- [ ] Verify the labelled action groups at desktop and mobile sizes.
- [x] Localise dynamic meal titles, ingredient lines, slots, and guidance instead of translating only static interface labels.
- [ ] Verify the Catalan daily and weekly plans contain no English ingredient text.
- [x] Generate a new daily meal set through the server-side OpenAI Coach flow, with Cala dish validation context and a safe local fallback.
- [ ] Verify regenerated daily plans do not reuse the prior set and still receive Fal images.
- [x] Show one daily and four weekly Quota Vita Milkshake protein-substitution options, calculated at 24 g protein per 100 ml.
- [x] Review the automatic Fal image flow for daily and weekly cards, including request count, card replacement, and failure fallback.
- [x] Diagnose the restaurant-photo upload and LogMeal analysis failure; show a usable result or an actionable error after an upload.
- [x] Place the desktop live-Coach conversation and composer beside the remaining-target summary.
- [x] Preserve the mobile chat placement below the touch meal deck.
- [x] Verify desktop and mobile chat submission after the responsive layout change.
- [x] Isolate the automatic Fal-image change from unrelated in-progress work.
- [x] Release and verify the isolated change on coach.quotavita.com.
- [x] Keep the active daily-meal deck intact while Fal images arrive.
- [x] Verify swiping and meal actions remain available during image loading.
- [x] Automatically request Fal images for all new daily-meal cards.
- [x] Prevent duplicate image requests and give failed requests a non-blocking fallback.
- [x] Verify automatic image loading without exposing a generation action.
- [ ] Use a touch-only Tinder-style phone deck: swipe right to eat and left to skip.
- [ ] Use a non-swipe desktop meal board with visible actions for all meals.
- [ ] Verify mobile touch gestures and desktop buttons independently.
- [x] Add a persistent Start over control to the top navigation.
- [x] Add visible numeric keyboard shortcuts to quick-reply choices.
- [x] Ensure numeric shortcuts work for profile and training choices without intercepting typed numeric answers.
- [x] Verify the production build locally before deployment.
- [x] Verify the production deployment and custom-domain alias.
- [x] Add a server-only Fal route for on-demand meal imagery.
- [x] Verify Fal image generation in production with a sample meal title and no personal data.
- [x] Preserve the device profile while resetting the daily plan and training choice.
- [x] Add a date-aware daily check with completed-meal status and streak points.
- [x] Add weekly plan and basket print-to-PDF plus mail-app sharing.
- [x] Make the Coach responsive without auto-scrolling the conversation title out of view.
- [x] Remove the desktop header and make the Coach canvas full-width.
- [x] Replace the ambiguous daily-proposal control with clear meal actions in a full-screen scroll deck.
- [x] Add a server-only OpenAI-backed live Coach conversation with general-wellbeing guardrails.
- [x] Limit onboarding to the current question plus two prior answers so the chat stays centred.
- [x] Keep restaurant logging inside the daily meal deck and add left/right swipe meal actions.
- [x] Keep the active onboarding question at the top of the chat; retain prior answers without displaying them.
- [x] Persist and display daily plus total points, with one clear final-check reward.
- [x] Connect weekly plan and basket email delivery directly to xat.quotavita.com's Resend/Shopify service.
- [ ] Verify a live customer delivery using an email address approved for the test.

## Review

## Compact plan-control release — 2026-08-29

- [x] Place daily controls in the compact top toolbar instead of a large panel above meals.
- [x] Place weekly basket, PDF, email, and return controls in the same compact top toolbar.
- [x] Reduce the weekly plan's top whitespace.
- [x] Keep the Milkshake substitution compact and keep swipe-card actions inside the meal card.
- [x] Deploy to `coach.quotavita.com`.

### Review

Production deployment `dpl_CMz59Wr18xEv1Tp2C7QjpbM4wsh2` is ready and aliased to `coach.quotavita.com`. Syntax, project tests, and whitespace checks passed before release. Manual product QA is left to the user as requested.

## Phone controls and compact-card release — 2026-08-29

### Review

Production deployment `dpl_6qbKjb8rGGUCzUwTBteRnBdXDFjd` is ready and aliased to `coach.quotavita.com`. Desktop controls now live in the Talk to your Coach panel, so the daily board starts higher. On phone, the action row is replaced by a Plan drawer and the fixed swipe hint no longer covers the card action. Daily and weekly plans offer a saved compact view with individual Details controls. The local browser flow confirmed the 390 px layout has no horizontal overflow, the menu opens and closes, the meal action stays inside the card, and the compact weekly cards expand independently.

The top control clears only local Coach data and restarts onboarding. Quick replies are native buttons (Tab/Enter works) and also show/use numeric shortcuts.

The daily plan now opens as a full-viewport horizontal deck. Swipe gestures move between meals; meal buttons are retained for logging so an accidental swipe cannot record an outcome. A mobile browser check confirmed the viewport height, left/right navigation, keyboard support in code, and meal logging; `npm test`, syntax validation, and whitespace checks also pass.

Daily meal cards now request their Fal visuals automatically. Requests are deduplicated by day, activity, meal, and title, and each result is saved locally for the active plan. Failed requests show an unobtrusive unavailable state rather than exposing a manual generation action. Browser verification mocked Fal responses and confirmed three automatic requests, successful rendering, failure fallback, and no generation controls.

## Daily meal macro hierarchy — 2026-08-29

- [x] Show protein, carbohydrates, and fat on each daily meal card.
- [x] Emphasise protein while keeping carbohydrates and fat secondary.
- [x] Verify rendered markup and the project checks.

### Review

Each daily meal card now displays its protein, carbohydrate, and fat values. Protein is the bold lead macro; carbohydrates and fat follow as secondary text. JavaScript syntax validation, the ten-test project suite, whitespace validation, and a source-level macro markup check all pass.

## Isolated daily macro deployment — 2026-08-29

- [x] Create a production deploy source containing only the daily macro hierarchy update.
- [x] Deploy it to the linked EU Vercel project.
- [x] Verify the resulting production URL serves the macro update.

### Review

Deployment `dpl_FgDbUmJGyPpVbc46fWZTGWY4VoXA` is ready in production and aliased to `coach.quotavita.com`. The public `coach.js` response includes the bold protein summary followed by carbohydrate and fat values. The release source was isolated from the other uncommitted project changes.

Fal image results now update only their own card placeholder instead of re-rendering the complete daily deck. This preserves the selected meal, current swipe position, and meal controls while images finish loading. A delayed-response browser check confirmed the deck remained intact on meal two and its meal action still worked.

On desktop, Talk to your Coach now shares the remaining-target card: the calorie/macro ledger stays on the left and the live conversation plus composer sit to its right. On phone, the existing Coach placement below the swipe deck is retained. Browser verification confirmed both responsive layouts and live-Coach form submissions.

The automatic-image change is live on `coach.quotavita.com` from Vercel production deployment `dpl_7m2QiT2yvNqtpy9463zESBzKcC4d`, promoted after preview verification. The live HTML now requests `coach.js?v=responsive-swipe-v2`; the deployed script contains `loadMealImages` and no manual generation control. A generic production request returned an image from Fal.

## Responsive desktop meal board — 2026-08-29

### Review

Desktop now uses the available canvas instead of a fixed 1,440 px board: cards reflow at smaller desktop widths and their photos scale with their own card width. The excess top inset is removed and the Coach prompt is one concise sentence.

On phone, the desktop summary is suppressed. A compact Conversation button opens and reduces an in-place Coach drawer without interfering with the swipe deck; all phone controls fit within a 390 px viewport.

The weekly basket displays one source note directly beneath its title: “Referència de supermercat mig.” No row repeats a market-reference label. Browser checks covered 1,024 px, 1,280 px, 1,920 px, and 390 px layouts plus the Catalan basket; syntax, whitespace, and all ten project tests pass.

## Full design, responsiveness and flow revision — 2026-08-29

- [x] Move every rule out of JavaScript into one stylesheet (`public/coach.css`) and delete the 17 injected `<style>` blocks.
- [x] Rebuild the visual language: espresso shell, cream cards, terracotta accent, serif display, full-bleed food photography.
- [x] Replace the "Plan options" grab-bag with a persistent navigation: bottom tab bar on phone, header nav on desktop, secondary actions in one overflow menu.
- [x] Rework onboarding: answer transcript, working Back, honest "Step n of 7" progress.
- [x] Put the "still to eat" target back on the phone as a sticky panel; it was `display:none` on mobile.
- [x] Stop destructive re-renders: logging a meal and the arrival of the generated plan now patch in place.
- [x] Make the weekly setup answers actually shape the week.
- [x] Close the Catalan gaps: food names, weekday names, activity labels and every new string.
- [x] Verify at 390, 620, 768, 900, 1180 and 1440 px, in both languages, then deploy.

### Review

The stylesheet is the change that made the rest possible. Every previous fix had been another
injected `<style>` block fighting the minified base CSS inside `api/index.js`, so two palettes
(pine green and brown) were live at once and each correction needed `!important`. There is now one
token set and one place to change a colour, a radius or a spacing step.

Navigation is now a model rather than a toolbar. Today, Week, Basket and Coach are always one tap
away — a bottom tab bar on the phone, a header nav on desktop — and the seven secondary actions sit
in a single grouped overflow menu. The weekly toolbar that ran off the right edge of a 390 px screen
no longer exists.

Onboarding keeps its answers on screen, has a real Back button, and its progress bar tells the truth
(seven steps, not a three-dot stepper stuck at one). The desktop shell now fills the viewport; the
cream L-shaped band at 1440 px is gone.

On the phone the calorie and macro target is a sticky panel that stays under the header while the
meal cards scroll beneath it. Logging a meal updates that panel and the one card in place: scroll
position holds and the meal photographs are not re-fetched. The generated plan swaps into the list
the same way instead of re-rendering the whole page underneath the reader.

Verified at 390, 620, 768, 900, 1180 and 1440 px with zero horizontal overflow at every width, in
English and Catalan, across onboarding, Today, Daily check, Week, both baskets, the Coach chat, the
restaurant modal and the email dialog. `npm test` passes its 23 tests; `node --check` passes.

## Agent readiness (Is Agentic 42/100) — 2026-08-29

- [x] Server-render the homepage: H1 + 500+ chars of real text inside `#coach`, replaced by the app on boot.
- [x] Homepage metadata: canonical, og:type, og:image, og:title/description, twitter card.
- [x] JSON-LD `@graph` on the homepage: SoftwareApplication + Organization with contactPoint and PostalAddress.
- [x] Markdown content negotiation (acceptmarkdown.com) on every HTML route: `text/markdown`, `Vary: Accept`, 406, q-values.
- [x] Agent-friendly 404: real 404 status with a Markdown body pointing at sitemap, llms.txt and docs; JSON under `/api/`.
- [x] Structured JSON errors everywhere: `error` string kept for the client, plus `code`, `message`, `hint`, `documentation`.
- [x] OpenAPI 3.1 document at `/openapi.json`, `/openapi.yaml` and `/api/openapi.yaml`, with unique operationIds, typed schemas and descriptions.
- [x] Public unauthenticated endpoints: `/api/health`, `/api/shop`, `/openapi.json`.
- [x] Developer portal at `/developers` plus `/docs`, linked from the homepage.
- [x] Trust anchor pages `/about`, `/contact`, `/privacy` with 500+ chars each, HTML and Markdown twins.
- [x] `/llms.txt` with a "When to use this" section, `/agents.md` long form, `/.well-known/llms.txt`.
- [x] `/sitemap.xml` with lastmod, and `/robots.txt` allowing named AI crawlers.
- [x] Tests for negotiation, YAML, OpenAPI shape, page content, sitemap and error envelope.
- [x] Verify every endpoint on a preview deployment, then on production.

### Review

Production deployment `dpl_7LvQF33xHS8CXDRHEsYHCCSiahbW` is ready and aliased to `coach.quotavita.com`. 58 tests pass. All 21 public URLs verified live.

The homepage now serves 3,034 characters of real text and an H1 without JavaScript; `coach.js` overwrites it on boot, so the interface is unchanged. Every HTML URL answers `text/markdown` under `Accept` negotiation with `Vary: Accept, Accept-Encoding` and `406` for a type it cannot serve. Unknown paths return a real `404` with a Markdown map (JSON under `/api/`). The OpenAPI 3.1 document validates, with 11 unique operationIds, typed parameters and response schemas on every operation.

One trap found and fixed during verification: a Vercel `rewrites` catch-all is matched **before** dynamic routes, so `/(.*)` silently swallowed the Shopify App Proxy at `api/proxy/[...path].js`, turning its `401` into a `404`. Both catch-alls now carry a negative lookahead for it, and a test walks `api/` for `[dynamic]` directories and fails if a new one is not excluded.

Follow-ups since closed:

- The registered address `Joan XXIII, 8 · 08330 Premià de Mar` is now the `streetAddress` in the Organization JSON-LD and on `/contact`, in both variants. A test asserts the page and the graph agree.
- The app carries its own links to the site and developer pages: a **Quota Vita** group in the overflow menu for the running Coach, and a link row beside the disclaimer in the setup view, which has no menu yet. The extra group made the menu taller than a short viewport, so `.overflow-menu` is now capped against the viewport and scrolls.

Still open: no `telephone` in the Organization schema — nothing in the repo or the Shopify store confirmed a support number.

## Monetization step 1–2: measurement and a buyable basket — 2026-08-29

From the competitive read against Cal AI, MyFitnessPal, Noom, Zoe, MacroFactor,
Yazio, Nutrola and Samsung Food. The finding that set the order: the Coach gave
away the conversation, the plan, the images, the basket and the record, and kept
nothing on either axis those companies monetize. Identity and payment are the
blocking gaps, but measurement and commerce are the two that need no new
credentials and no account, so they ship first.

- [x] Add an event stream (`api/events.js`) with an allowlist of event names,
      a random non-identifying session id, and no personal data. Writes to
      Supabase when configured, otherwise to the function log.
- [x] Add `supabase/migrations/202608300001_coach_events.sql`, deliberately
      separate from the nutrition tables so it sits outside the consent gate.
- [x] Add `server/shop.js`: the sellable catalogue, the milkshake-to-powder
      conversion, the tub recommendation and the attributed Shopify cart link.
- [x] Add `api/shop.js` so variant ids and attribution parameters stay
      server-side, as in xatquotavita's `lib/catalog.mjs`.
- [x] Turn the Quota Vita Milkshake swap on every meal card into a checkout.
- [x] Add a "Cover the protein swap" block to the one-day and seven-day baskets.
- [x] Track onboarding completion, targets shown, meals logged, baskets created,
      offers shown and checkouts opened.
- [x] Cap the recommended tub at 1.5 kg and report honest coverage.
- [ ] Create the Coach discount code in Shopify and set `COACH_DISCOUNT_CODE`.
- [ ] Deploy to coach.quotavita.com.
- [ ] Run `202608300001_coach_events.sql` and set the Supabase variables, so
      events land in a queryable table instead of the log.

### Review

`npm test` passes 23 checks, 12 of them new and covering the shop module.

Verified in a real browser against a local server running the actual handlers:
the meal card renders "Buy the protein" with the tub, its coverage and a per-day
cost; the basket renders the same offer as a block; the cart link resolves to
`/cart/51948700729691:1` with `ref=coach` and the UTM parameters; the event
stream received `coach_opened`, `targets_shown`, `shop_offer_shown` and
`shop_checkout_opened` with a stable session id and no personal data in any of
them.

One product bug was found and fixed during that verification. A plan drinking
200 ml a day needs 56 servings a month, and the original "smallest tub that
covers the period" rule therefore opened with the 4 kg tub at 156 EUR. It now
caps the recommendation at 1.5 kg and quotes the true 25-day coverage at 71.90
EUR, which is the order a first-time customer will actually place. The 4 kg
stays available in the full offer list.

Attribution works with no discount code: every cart link carries `ref=coach` and
`utm_source=coach`, so Shopify can separate Coach orders today. Setting
`COACH_DISCOUNT_CODE` adds a code on top, matching what xat already does with
TEST10.

Steps 3 to 7 of the plan — server-side identity, the daily return trigger, the
free/paid cut line, the legal floor and the paywall test — are not started. Each
needs a credential or a decision that is not mine to make.

## Monetization step 3: Shopify customer identity — 2026-08-29

Chosen model: Shopify customer accounts. The problem it has to solve is that the
Coach runs on coach.quotavita.com while Shopify only fills in
`logged_in_customer_id` for a request that goes through the App Proxy on the
shop's own domain. Those are different origins, so the shop's session cookie
cannot be relied on and a CORS preflight through the proxy is not a foundation
for a login.

So the identity is handed over once. The customer visits
`/apps/nutrition-coach/link`, Shopify signs that request, the proxy mints a
short signed token naming the customer and redirects back to the Coach with it
in the URL fragment — which browsers never send to a server and never put in a
Referer. The Coach then presents that token to its own API on its own origin,
with no cookies and no CORS.

- [x] `server/session.js` — mint and read a signed identity token. Carries a
      customer id, a shop and an expiry, and nothing else.
- [x] `server/nutrition-store.js` — every read and write of a customer record in
      one place, so the App Proxy and the Coach's own API cannot drift on what
      consent means or what a saved profile looks like.
- [x] `api/proxy/[...path].js` — refactored onto that store, plus the new `link`
      route. Redirects to the shop's login when nobody is signed in.
- [x] `api/account.js` — the Coach's own bearer-authenticated API: profile,
      meal logging, GDPR export and erasure.
- [x] Client: capture the token, strip it from the address bar, reconcile the
      device with the account on load, push the profile and each logged meal.
- [x] An account view with an explicit consent checkbox that gates the connect
      button, plus sync, export and delete.
- [x] Point `shopify.app.toml` at coach.quotavita.com instead of the stale
      project-kx8dj.vercel.app.
- [x] Deploy.
- [ ] Set `COACH_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
      and `SHOPIFY_APP_PROXY_SECRET` in Vercel.
- [ ] Run `npx shopify app deploy` so the App Proxy points at the new URL.

### Review

`npm test` passes all 57 checks, 20 of them new across `session`, `shop` and
`account`. The account suite covers the parts that would be expensive to get
wrong: an unsigned request never mints a session, a signed request with no
customer is sent to the shop's login rather than given one, a caller-supplied
`return_to` cannot redirect the token anywhere, and a forged or wrongly signed
token cannot reach the record.

Verified in a browser: the token is captured from the fragment and the address
bar is cleaned; the consent checkbox gates the connect button; and the account
view refuses to claim a plan is saved until the server confirms it — with
Supabase absent it says "We could not reach your account. Your plan is safe on
this device."

The whole feature is invisible until it is configured. `GET /api/account`
without a token answers the capability question rather than 401, the client asks
it once on load, and the Account entry does not appear in the menu unless the
server says accounts exist. Verified locally: with Supabase unset the menu shows
only Today, Week and View.

**Not deployed.** A second agent session is working in this repository at the
same time and has an unfinished agent-ready layer in the working tree —
`server/http.js`, `api/openapi.js`, `api/llms.js`, `api/sitemap.js` and a
rewritten `api/index.js`, none of it live. Deploying now would push that work to
production too, which is not this session's call. Steps 1 and 2 are already live
and unaffected.

## Step 3 deployed, and a bug production found — 2026-08-29

Deployed on request, carrying the other session's agent-ready layer with it;
`llms.txt` and `openapi.json` are now live too. Verified after the deploy:
`/api/account` answers `configured: false`, an unsigned `/api/proxy/link` is
refused with 401 and no `Location`, `/api/events` accepts a beacon, and the
Account entry stays out of the menu because the server says accounts do not
exist yet.

**The buy button was missing in production and worked locally.** Local had no
`OPENAI_API_KEY`, so `/api/daily-meals` returned 503 and the fallback meal list
rendered once inside `mount()`, where `fillShopOffers()` runs. In production the
generated plan arrives a second later and `refreshMealList()` replaces the whole
list — new nodes, no offer, and nothing re-fills them. Logging a meal had the
same problem through `refreshMealCard()`.

`fillShopOffers()` now runs after every path that rewrites meal markup, not only
after `mount()`. Re-deployed and re-checked against the real generated plan: the
meal card and both baskets render "Buy the protein · Whey Crema Catalana 1.5 kg
· 25 days · €71.90 · €2.88 a day" pointing at `/cart/51948700729691:1`.

The lesson is in `tasks/lessons.md`: a local environment missing a provider key
exercises a different render path from production, so a feature attached to
generated content has to be verified against the generated content.

## Accounts switched on, and the bug that was blocking them — 2026-08-29

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SHOPIFY_APP_PROXY_SECRET` were
already set. Only `COACH_SESSION_SECRET` was missing; generated and added.

Every App Proxy request was then being rejected with "Invalid Shopify App Proxy
signature." The obvious reading was a wrong shared secret, and the obvious next
step was to make someone rotate a production credential on that hunch. It was
not the secret.

A rejected proxy request is indistinguishable from outside — a wrong secret and
a query string that never arrived look identical — so `logSignatureFailure` was
added to log the parameter *names* and lengths, never the values or the
signature. Production answered immediately:

```
keys: ["...path","logged_in_customer_id","path_prefix","shop","signature","timestamp"]
hasSignature: true, signatureLength: 64, secretConfigured: true, secretLength: 32
```

Vercel appends the catch-all route parameter for `[...path].js` to
`request.url` itself, so it arrives as a query parameter literally named
`...path`. Shopify never signed that field, so the HMAC could never match. The
original code read from `request.url` rather than `request.query` specifically
to avoid this, and its comment claimed it worked — on this runtime it does not.
The injected key has to be removed by name.

- [x] Add `COACH_SESSION_SECRET`.
- [x] Add a `COACH_ACCOUNTS_ENABLED=false` kill switch and hide the account UI
      while the proxy was broken, because there was live traffic at the time.
- [x] Log rejected-signature *shape* so this class of failure is diagnosable
      without touching secrets. Kept: it fires only on failure and leaks nothing.
- [x] Strip Vercel's route parameters before verifying the signature.
- [x] Regression test using the exact query shape observed in production.
- [x] Remove the kill switch and deploy.
- [ ] Run `202608300001_coach_events.sql` in the Supabase SQL editor.
- [ ] Sign in as a customer once and confirm the round trip end to end.

### Review

62 tests pass. Verified live after the fix:

```
/apps/nutrition-coach/link     302 → 00kexr-ph.myshopify.com/account/login
/apps/nutrition-coach/profile  {"error":"Sign in to your Quota Vita account…"}
/api/account                   {"configured":true,"signedIn":false}
```

Both proxy responses prove the signature now verifies: the first reaches the
logged-out branch, the second reaches the customer check. Accounts are live.

`npx shopify app deploy` turns out not to be urgent. The App Proxy already
resolves to this same Vercel project through the `project-kx8dj.vercel.app`
alias, which is why requests were arriving at current code all along. Pointing
it at `coach.quotavita.com` is tidier but changes no behaviour.

Still outstanding: `coach_events` does not exist, so every event is accepted and
dropped. The nutrition tables do exist — Supabase's own error hinted at
`public.consents`.

## The sign-in round trip — 2026-08-29

Reported: after "Save my plan to my account" and signing in, you land on the
Shopify account home. Dead end.

Cause: this store uses Shopify's **new customer accounts**, where the classic
`/account/login?return_url=` is not merely ignored, it is dropped. Verified
directly — `/account/login` and `/account/login?return_url=/apps/…` return the
identical 302 to `account.quotavita.com`, carrying nothing about where the
customer came from. So the customer signs in successfully and Shopify has no
idea it owed them a journey back.

New customer accounts use `/customer_authentication/login?return_to=`, and
`return_to` accepts only a relative path. That path starts a real OAuth
authorize with a `/customer_authentication/callback` redirect_uri, which is what
carries the return through.

- [x] Redirect to `/customer_authentication/login?return_to=…` instead.
- [x] Build the return path from Shopify's own `path_prefix`, so it still points
      at the right route if the proxy subpath is ever changed.
- [x] Use the storefront's primary domain, overridable with
      `COACH_STOREFRONT_URL`, rather than the myshopify domain.
- [x] Update the test to assert the path and the relative `return_to`.

### Review

62 tests pass. Verified live, logged out:

```
/apps/nutrition-coach/link
  → 302 www.quotavita.com/customer_authentication/login?return_to=%2Fapps%2Fnutrition-coach%2Flink
  → 302 account.quotavita.com/authentication/oauth/authorize?…&redirect_uri=…/customer_authentication/callback
```

Signed in, the same URL skips all of that: Shopify supplies
`logged_in_customer_id`, the proxy mints the session and redirects straight back
to the Coach.

## Improve the Coach emails

The plan and basket emails are rendered by the xat mailer
(`~/xatquotavita/lib/email.cjs`), where `coachPlanEmail()` sat next to the two
polished xat templates without their treatment: it prefixed **every** line of
`weeklyText()` with `□ `. Day headers, the price disclaimer and the already
bulleted basket lines (`□ - 250g chicken`) all got a checkbox, and
`[Catalan dish: Escalivada]` reached the inbox as a raw annotation.

- [x] Move the Coach copy into the `T` table as `c*` keys (ca + en), next to
      `r*` and `f*`, instead of inline ternaries.
- [x] Give `shell()` an optional preheader, so Gmail stops previewing the kicker.
- [x] Render from structure: a card per day for the plan; a checkbox list plus a
      priced estimate table for the basket. Same palette, `ctaButton` and footer
      as `resultEmail` / `followUpEmail`.
- [x] Add the CTA back to the Coach and the `— Gerard, Quota Vita` sign-off.
- [x] Send `text/plain` (`payload.text` in `send()`), which is what people paste
      into Notes.
- [x] Coach sends `weeklySections(kind)` alongside `checklist`; `weeklyText()` is
      now derived from it so the two cannot drift.
- [x] Keep a fallback that rebuilds the layout from the flat text, for browsers
      still running a cached `coach.js`.
- [x] Reuse the existing `catalan` dictionary for the estimate wording via a new
      `localise()` helper, rather than adding a second Catalan translation.

### Review

Rendered all seven variants (plan/basket × ca/en, both legacy-text fallbacks and
`resultEmail` as the reference) and read them in the browser. No stray
checkboxes on headings, no `□ -`, no `[Catalan dish: …]`; the Coach email now
reads as the same family as the xat ones.

`npm test` passes in both repos (62 tests here, 24 in xatquotavita). No email was
sent — `send()` only calls Resend when `RESEND_API_KEY` is set.

The Catalan strings could not be checked against Softcatalà: the LanguageTool
endpoint answered 502 on every attempt. Worth re-running once it is back.

## Retention programme — 2026-08-30

Audit of coach.quotavita.com against the retention mechanics of high-traffic
consumer products. Five items, agreed with the user, plus a visual quality pass
requested mid-flight ("the design of all the web looks cheap").

### Root cause found first

`GET /api/account` with a valid session token returned 500 in production:

    Supabase 403 42501: permission denied for table meal_entries

and every `POST /api/events` was failing silently:

    Supabase 404 PGRST205: Could not find the table 'public.coach_events'

Both are the same fault: `supabase/migrations/202608300002_service_role_grants.sql`
was written but never run against the live database. Accounts and analytics were
built and deployed; neither could work. That is why the Coach falls back to
"This plan is stored only in this browser".

### 1. Persistence against the Shopify customer id
- [ ] Add a `coach_progress` table: XP, streak, freezes, badges, per-day record.
- [ ] Store helpers with merge-on-conflict semantics, plus export and erasure.
- [ ] `/api/account` reads and writes progress; one failing sub-query must no
      longer 500 the whole request.
- [ ] Client syncs progress on load and after each award, localStorage becomes a
      cache rather than the record of truth.
- [ ] Replace the "stored only in this browser" dead end with a real sync offer.
- [ ] Consolidated SQL for the user to run once (blocked on Supabase access).

### 2. Measurement
- [ ] `coach_events` created by the same SQL run.
- [ ] `/api/health` reports store reachability so this cannot rot silently again.
- [ ] Retention views (D1/D7/D30, activation, basket conversion).

### 3. Installable and re-engageable
- [ ] Web app manifest and icons.
- [ ] Service worker: offline shell, cached plan.
- [ ] Install prompt.
- [ ] Evening reminder.

### 4. Visual quality
- [ ] Display typeface and a real type scale.
- [ ] Fix the sticky summary card overlapping the meal cards.
- [ ] Macro bars that fill and carry state colour.
- [ ] Replace emoji badges and the emoji streak with a drawn icon set.
- [ ] Shadow, border and radius discipline; compositional contrast.
- [ ] Button hierarchy.
- [ ] Dark mode.
- [ ] Motion, with a reduced-motion path.

### 5. Remove the blank boxes
- [ ] Weekly goal preset chips.
- [ ] Coach starter prompts.
- [ ] Stale XP toast that survives navigation.
- [ ] Isolate "Delete this device plan" from ordinary actions.

---

## Coach → Shopify attribution via UTM (2026-08-30)

### What was already there

`cartUrl()` in `server/shop.js` was already emitting `ref=coach`,
`utm_source=coach`, `utm_medium=app` and `utm_campaign=milkshake|basket`, and it
is already live. The gap was not "no UTMs" — it was that every cart link looked
the same, so Shopify could say *a Coach session bought* but never *which
placement sold it*, and the product page link was untagged entirely.

### Changes

- [x] `server/shop.js` — one `attributionParams()` builds the parameters for
      every outbound shop link; `ATTRIBUTION_SURFACES` is the closed list of
      placements and `attributionSurface()` drops anything outside it, so a
      stale client cannot invent a `utm_content` bucket. `campaignName()` does
      the same for `utm_campaign`.
- [x] `server/shop.js` — new `productUrl(handle, {campaign, surface})`. The
      storefront link was the one commercial link arriving anonymous. It is
      deliberately built without `discount`: a code on a product URL does
      nothing in Shopify, codes only apply on the cart permalink.
- [x] `coachOffer()` and `shopOffers()` take a `surface` and attribute the
      checkout and the product page to the same one. `shopOffers()` now also
      returns `productUrl`.
- [x] `api/shop.js` — accepts and validates `surface`; it is part of the query
      string, so two placements no longer share a CDN cache entry.
- [x] `public/coach.js` — `data-shop-surface` on each placement:
      `meal_card` (protein swap on a meal card), `weekly_basket`, `daily_basket`.
      The same word goes to `/api/events` on `shop_offer_shown` and
      `shop_checkout_opened`, so the internal funnel and Shopify's session
      report join on one vocabulary.
- [x] 7 tests in `tests/shop.test.js`. Suite: 78 pass, 0 fail.

### Verified against the live shop, not just locally

`GET https://www.quotavita.com/cart/51948700729691:1?ref=coach&utm_source=coach&utm_medium=app&utm_campaign=milkshake&utm_content=meal_card`
→ `302` to checkout with **all four UTM parameters and `ref` intact** in the
redirect target and in the nested `ur_back_url`. The attribution survives the
cart→checkout hop, which was the thing worth proving before shipping.
Product URL with the same parameters → `200`.

### Not done, deliberately

- **`COACH_DISCOUNT_CODE` is still unset in production** — checked live, the
  cart links carry no `discount`. The code path exists and is tested. Creating
  `COACH10` in the Shopify admin and setting the env var is what turns
  attribution from *inferred from sessions* into a deterministic row in
  Shopify Admin → Discounts, the way `TEST10` already proves the chat funnel.
  This is a Shopify admin action, not a code change.
- Prose and JSON-LD links to `www.quotavita.com` in `server/site.js` are left
  untagged on purpose: structured-data `url`/`sameAs` must stay canonical.
- `accountLinkUrl` (the App Proxy link) left untagged — it is a functional auth
  hop, and extra parameters there risk the signature flow for no reporting gain.

### Still not deployed

All of the above is in the working tree only.

### Review — 2026-08-30, 00:40

**Done and verified locally** (78 tests pass; syntax, token and manifest checks pass):

1. *Persistence.* `coach_progress` table, `mergeProgress` with nine tests covering
   two-device merges, sixty-day trimming and hostile input. `/api/account` gains a
   progress read and write and no longer answers 500 when one side table is
   unreadable — the profile still fails loudly, because "no profile" and
   "unreadable profile" must not look the same to the client. The Coach syncs on
   load and after each award, coalesced, with a keepalive write when the tab hides.
2. *Measurement.* `/api/health?deep=1` probes every table and reports
   `ok`/`unavailable`. New event names allowlisted for installs and for the two
   former blank boxes.
3. *Installable.* Manifest, four icons, service worker (network-first shell,
   stale-while-revalidate assets and meal photography, `/api/*` never cached),
   and an install offer that waits until there is a plan and some progress.
   The worker also carries the notification plumbing the evening nudge will use.
4. *Visual.* Fraunces for display; a type scale; the sticky summary card now
   collapses from 204px to 57px when stuck instead of covering the meal list;
   macro rows read `eaten / target` and fill as you eat, with state colour; the
   eight badge emoji replaced by one drawn SVG set; shadows tightened and a
   hairline ring added; meal actions given a weight hierarchy.
   Dark mode was built and then removed at the user's request.
5. *Blank boxes.* Five weekly-goal chips and four Coach starters built from the
   day's actual plan. `Delete this device plan` moved out of the ordinary action
   row into its own zone.

**Corrected from the audit:** the "stale XP toast" was not a bug — the tab
switches happened inside its 2.6s life. A real dark-mode contrast fault in the
same component was fixed instead, then became moot.

**Blocked, needs the user:**

- The SQL has still never been run. `npm run db:sql` → Supabase SQL editor.
  Until then `/api/account` stays 500 and every event is still dropped. No
  Supabase credential exists outside Vercel, so this cannot be done from here.
- Nothing is deployed. Every change above is local only.

**Not started:** the scheduled evening reminder. Web push needs VAPID keys, a
subscription table and a cron; putting a second unapplied migration on top of
one that is already blocking would be the wrong order. The installable shell it
depends on is now in place.

**Warning:** another agent session is editing this repository concurrently. It
dropped the dark-theme block from `coach.css` and reverted two meta tags in
`server/http.js` mid-session. Both were re-applied. Anything else written here
tonight is at the same risk.

## Three design directions from Awwwards — 2026-08-30

- [x] Research the current Awwwards winners and work out what reads as expensive.
- [x] Build three directions as real, switchable themes rather than mockups.
- [x] Test each with five task runs plus measured contrast and overflow.
- [x] Fix what the testing found, then publish the proposal.

### Review

Studied Miu Miu "A House that we shaped", LIKOVA, Oimachi and Awwwards' own
pages. Five things they share, none of them decorative: a committed ground, one
typeface at enormous size contrast, a single accent used once, air as the
material, and hairlines rather than shadows. The Coach was doing none of them —
page and cards two per cent apart, terracotta on every label, the calorie figure
smaller than the headline above it, and the food photography cropped to a strip.

Three directions built as opt-in themes at /?theme=paper|ink|kitchen: Editorial
Paper (type-led, safest), Ink & Bone (black as a material, most striking) and
Kitchen Table (photograph as the screen, most cinematic).

Five task runs per direction — read the target, log a meal, find a dish, open
the week, close the day — all pass in all three at 320 to 1280px with no
horizontal overflow. Two contrast failures were found by measurement: section
labels at 2.6:1 after the accent was demoted, and Kitchen's first attempt
setting type straight onto bright food photographs. Both fixed.

Proposal published at claude.ai/code/artifact/9dd675e9-268b-4ef7-aaa8-71d445a97d52

## Weekly-basket email crash — 2026-08-30

- [x] Reproduce `Can't find variable: weeklySections` on the send-my-weekly-basket modal.
- [x] Restore `weeklySections()` on top of the aisle-grouped basket.
- [x] Verify both kinds, priced and unpriced, in a browser.
- [x] Deploy and verify on `coach.quotavita.com`.

### Review

Commit 4d1f0b7 regrouped the basket into shop aisles and rewrote `weeklyText()`
to read `groups` and `estimate` off a structured week, but `weeklySections()` —
the function that builds that structure — went out with the old flat-list
version. Both call sites survived, so submitting the email modal threw
`ReferenceError: weeklySections is not defined`, surfacing under the field as
"Can't find variable: weeklySections". Downloading the basket PDF was broken the
same way. The whole weekly-basket email path had been dead on production since
that commit.

The function is rebuilt on the basket the screen already draws: `groups` in
aisle order for the layout, flat `items` as the mailer's fallback, and the
estimate only once `/api/basket-prices` has answered. The plan side reads
`weeklyPlanEntries()`, so the emailed week is the week on the screen rather than
a second computation of it. One file, 25 lines added, nothing else touched.

Verified in a browser with `fetch` stubbed at `/api/shopify-email`, so no
customer mail was sent and no Shopify record written: basket with prices, basket
without prices, and the seven-day plan all build a valid payload, and the
confirmation state renders. The payload shapes were checked against
`validSections()` in `xatquotavita/api/coach-email.js` so they survive
validation instead of silently falling back to the plain text.

Production deployment `dpl_prrF1962Pdc4bAh62GgQ7aig8R8V` is ready and aliased to
`coach.quotavita.com`. The live `coach.js` is byte-identical to the fixed source,
and the eleven public URLs still answer 200. The release was cut from the working
tree, which was byte-identical to live apart from this fix — deploying the git
tree instead would have dropped the uncommitted `/about`, `/llms.txt`,
`/openapi.json`, `/agents.md`, `/sitemap.xml` and `/robots.txt` routes that are
live but never committed. 78 project tests pass.
