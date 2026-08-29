# Nutrition Coach interaction update

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

- [ ] Create a production deploy source containing only the daily macro hierarchy update.
- [ ] Deploy it to the linked EU Vercel project.
- [ ] Verify the resulting production URL serves the macro update.

Fal image results now update only their own card placeholder instead of re-rendering the complete daily deck. This preserves the selected meal, current swipe position, and meal controls while images finish loading. A delayed-response browser check confirmed the deck remained intact on meal two and its meal action still worked.
