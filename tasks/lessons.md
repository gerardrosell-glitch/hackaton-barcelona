# Interaction lessons

- When a choice can be completed by keyboard, show the shortcut in the interface as well as implementing it; invisible keyboard behavior is not discoverable.
- Persistent recovery actions belong in the top navigation when a user asks to restart at any moment.
- When the visual background changes, retune all text and control tokens as one palette; do not carry forward colors from the prior direction.
- A “start over” action must state whether it resets the daily plan or erases the person’s saved profile; preserve the profile for a daily reset.
- Automatic email delivery needs an approved mail provider; use a mail-app handoff when no sending service and consent flow have been configured.
- Do not auto-scroll a form field into view when it hides the title or prior conversation; focus inputs without changing the user's viewport.
- A label such as “proposal” is not an action. For a daily meal plan, use explicit outcomes (eat, restaurant, skip) and show one meal at a time in the flow.
- Keep user-provided health details local by default; a live AI Coach needs a clear disclosure and server-side credentials, with a general-wellbeing safety boundary.
- When removing a layout container, first remove or relocate every script dependency on that container; otherwise one null DOM lookup can blank the entire application.
- In a guided chat, bound visible history to the screen’s intended rhythm; preserving all answers can break the composition even when the data is saved.
- Keep a user in the same primary flow for a contextual action such as restaurant logging; use an overlay rather than replacing the whole screen.
- In a focused guided flow, the active prompt must lead the screen. Saved history is useful data, but it should not compete with the next action.
- A gamification action must persist an observable result: show the current reward, the all-time balance, and replace the action once it is complete.
- When email delivery is part of a Shopify workflow, implement the actual server-side Flow handoff and consent record; do not leave a mail-app redirect in its place.
- Do not substitute a generic Shopify Flow workaround when an existing Quota Vita xat workflow is available; identify and use its exact trigger contract first.
- Do not force desktop users into a mobile-style full-screen gesture deck; give desktop a visible, click-first layout and reserve swipe actions for touch devices.
- Treat a desktop screenshot as a viewport requirement: validate the actual canvas at compact and wide widths rather than relying on a fixed desktop max-width or fixed image height.
- A desktop-only panel needs an explicit mobile replacement; hiding it in one stylesheet is not enough when later styles can reintroduce it. Test the touch layout after every responsive override.
- When a pricing source is only context for the estimate, show it once at the section level rather than repeating it beside every basket row.
- A gesture that works only through one browser event path is not sufficient for phone users; validate it with touch events and keep the fallback independent of pointer capture.
- When a primary screen has actions from more than one planning scope, group them by scope in the visual hierarchy instead of presenting one undifferentiated button row.
- When a user asks for controls to match the compact top navigation, move the controls into that navigation rather than preserving a large action panel elsewhere on the screen.
- Never put a full desktop action bar into a mobile swipe header; use a contained drawer and ensure fixed gesture guidance cannot overlap the card’s primary action.
- Localising only static DOM labels leaves data-driven content in the source language; meal copy must be translated before it is rendered.
- A deterministic fallback menu is not a sufficient primary experience when daily variety is promised; cache a generated plan per selected day while retaining the fallback only for service failures.
- When a product substitution has a declared nutrient density, calculate and show the exact serving amount rather than treating it as generic product placement.
- Image-generation verification must cover the request lifecycle and the rendered card, not merely the success response from the image endpoint.
- An uploaded image is not a successful photo-analysis flow until the downstream analysis response is verified and any unavailable provider state is explained clearly.

## Never patch a stylesheet by injecting another one — 2026-08-29

Seventeen `document.createElement("style")` blocks had accumulated in `public/coach.js`, each one
added to correct the previous, all fighting a minified base stylesheet embedded in `api/index.js`.
Two palettes were live at once and every new rule needed `!important` to land.

Rule for myself: when a second style block appears for the same surface, stop and extract the CSS
into one real stylesheet instead of adding a third. The cost of extracting grows with every patch.

## Sample the brand, never infer it — 2026-08-29

I chose an espresso-dark shell for the Coach on the strength of "warm and
Mediterranean". The brand is a light one: quotavita.com is white with near-black
Inter text, and the logotype is `#AC5C44`, which I only learned by downloading
`logo-horitzontal-quotaVita.png` and counting pixels. The repo even carried
`public/assets/coach-palette.png` — cream, apricot, sage — which said the same
thing before I started.

Rule for myself: before choosing any palette, sample the real assets — the live
site, the logo file, the theme's colour settings. Ten minutes of sampling beats
a redesign built on a guess.

## A grid track will escape its own padding — 2026-08-29

A card's children rendered 3px wider than the card. The card was `display:grid`,
and a grid track sizes to its item's min-content unless capped, so a composer
holding an `<input>` (default `size=20`) plus a button pushed the track past the
padding box. `min-width:0` on the input does not help; the track is the problem.

Fix: `grid-template-columns: minmax(0, 1fr)` on any single-column grid that holds
form controls or long text.

## A voice action is an allow-list, not an instruction — 2026-09-03

The tempting shape for voice control is to let the model name a function and pass it arguments.
That makes the model's output an instruction, and a health app then has a microphone wired to
`deleteEverything`. The shape that survives contact with a noisy kitchen is the opposite: one
file declares every action that exists and the exact range of every argument, the model
*proposes*, and a validator between them discards anything it did not recognise — unknown name,
unknown argument, out-of-range number, missing required field. Erasing data simply is not in
the catalogue, so no mishearing can reach it.

Rule for myself: before wiring a model to an app's functions, write the catalogue and its
validator first, and put the destructive operations outside it on purpose.

## Ship the offline half of a voice feature first — 2026-09-03

"Open my basket" going through a language model is a round trip, a key, and a failure mode, for
a sentence a regular expression settles. Worse, it fails in the one place the basket is most
needed: a supermarket basement with no signal. Matching the common commands on the device made
voice work offline, instantly, and with no key configured at all — and it left the model doing
only what it is actually good at, which is the phrasings nobody anticipated.

Rule for myself: for any natural-language feature, ask which fraction of real inputs is a fixed
vocabulary, and answer that fraction locally. The model is the long tail, not the front door.

## Extract the function before the second caller, not after — 2026-09-03

Voice needed to set today's training and to read out what was left of the day. Both already
existed — inside a click handler and inside a markup builder. Copying them would have given the
microphone its own idea of what "choose today's movement" resets, and the two would have
diverged on the first change. Pulling `applyTraining` and `remainingToday` out first cost a few
minutes; it is also how the extraction caught that `targetPanelMarkup` still needed `eaten`
after the split, which a copy would have hidden.

Rule for myself: when a second surface needs behaviour that currently lives inside a handler,
extract it in the same change, and re-read what the original still uses.

## Check what the model is *for*, not just what it is trained on — 2026-09-03

BSC's `catalan-verification-model-pkt-a` is a Catalan speech model from a source worth trusting,
and the obvious move was to wire it up. It is a *verification* model: it exists to run beside
`-pkt-b` and cross-check transcriptions while labelling training data. Pointing a user's
microphone at it would have been using a measuring instrument as a product.

Rule for myself: before adopting a model, read what its card says it is *intended to be used
together with*. A model card's training data tells you what it knows; its intended-use section
tells you whether it is the thing you need.

## Ask which half is broken before improving the half that isn't — 2026-09-03

The prompt was Catalan speech recognition, and recognition is the input side, so that is where I
started. But Chrome and iOS already do `ca-ES` dictation acceptably; what actually fails on a
real phone is the *output* — there is no Catalan voice installed, so the Coach speaks Catalan
with a Spanish accent. Improving recognition would have added a us-east-1 round trip, seconds of
latency and a contradiction of the privacy page, to fix something that was not broken.

Rule for myself: when handed a technology, find the failure it removes before finding the place
it fits. "More accurate" and "better to use" are different axes, and a voice loop trades the
first for the second every time.

## A finite set of sentences does not need a runtime service — 2026-09-03

The Coach's Catalan is not open-ended. Thirty-six sentences carry no live number, so they can be
spoken once by a real Catalan voice and shipped as files: no endpoint, no token in production,
no latency, no cost, no audio leaving the device, and it works offline. The six sentences that
do carry numbers keep the device voice. The whole difference between a build step and a
dependency was noticing that the copy is fixed.

Rule for myself: before integrating a generative service, count the distinct outputs. If the
count is small and stable, generate them at build time and ship the result.
