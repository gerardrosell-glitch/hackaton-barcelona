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
restaurant modal and the email dialog. `npm test` passes its ten tests; `node --check` passes.
