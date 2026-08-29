# Nutrition Coach interaction update

- [ ] Replace the vertical daily-meal list with a viewport-sized horizontal swipe deck.
- [ ] Keep meal actions usable without conflating a swipe with logging a meal.
- [ ] Verify touch, pointer, keyboard, and existing automated flows.
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
- [ ] Connect weekly plan and basket email delivery directly to xat.quotavita.com's Resend/Shopify service and verify a live customer delivery.

## Review

The top control clears only local Coach data and restarts onboarding. Quick replies are native buttons (Tab/Enter works) and also show/use numeric shortcuts.
