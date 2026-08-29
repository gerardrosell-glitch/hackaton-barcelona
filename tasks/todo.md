# Nutrition Coach interaction update

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

## Review

The top control clears only local Coach data and restarts onboarding. Quick replies are native buttons (Tab/Enter works) and also show/use numeric shortcuts.
