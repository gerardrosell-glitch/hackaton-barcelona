import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  APP_REPLIES,
  MAX_VOICE_ACTIONS,
  VOICE_ACTIONS,
  foldSpeech,
  matchVoiceCommand,
  normaliseVoiceAction,
  normaliseVoiceActions,
  spokenPhrases,
} from "../public/voice-commands.js";

const names = (result) => (result?.actions || []).map((action) => action.name);
const only = (result) => {
  assert.equal(result?.actions.length, 1, "expected exactly one action");
  return result.actions[0];
};

test("speech folds to accent- and apostrophe-free words", () => {
  assert.equal(foldSpeech("Què hi ha per sopar?"), "que hi ha per sopar");
  assert.equal(foldSpeech("M'he saltat el dinar"), "m he saltat el dinar");
  assert.equal(foldSpeech("Avui faig força"), "avui faig forca");
});

test("English navigation is understood with or without a verb", () => {
  for (const sentence of ["open my basket", "go to the basket", "show me the shopping list", "basket"]) {
    assert.deepEqual(only(matchVoiceCommand(sentence)).arguments, { view: "basket" }, sentence);
  }
  assert.deepEqual(only(matchVoiceCommand("take me to my progress")).arguments, { view: "progress" });
});

test("Catalan navigation is understood in the same shapes", () => {
  assert.deepEqual(only(matchVoiceCommand("ves a la cistella", "ca")).arguments, { view: "basket" });
  assert.deepEqual(only(matchVoiceCommand("obre la setmana", "ca")).arguments, { view: "week" });
  assert.deepEqual(only(matchVoiceCommand("el progrés", "ca")).arguments, { view: "progress" });
});

test("a meal is logged as eaten, skipped or eaten out, in both languages", () => {
  assert.deepEqual(only(matchVoiceCommand("I ate lunch")).arguments, { meal: "lunch", status: "eaten" });
  assert.deepEqual(only(matchVoiceCommand("I skipped breakfast")).arguments, { meal: "breakfast", status: "skipped" });
  assert.deepEqual(only(matchVoiceCommand("I ate out for dinner")).arguments, { meal: "dinner", status: "restaurant" });
  assert.deepEqual(only(matchVoiceCommand("he sopat", "ca")).arguments, { meal: "dinner", status: "eaten" });
  assert.deepEqual(only(matchVoiceCommand("m'he saltat el dinar", "ca")).arguments, { meal: "lunch", status: "skipped" });
});

test("asking about a meal reads it out instead of logging it", () => {
  assert.deepEqual(only(matchVoiceCommand("what's for dinner")), { name: "read_meal", arguments: { meal: "dinner" } });
  assert.deepEqual(only(matchVoiceCommand("què sopo", "ca")), { name: "read_meal", arguments: { meal: "dinner" } });
});

test("today's training is set from how a person actually says it", () => {
  assert.deepEqual(only(matchVoiceCommand("today I'm running")).arguments, { activity: "run" });
  assert.deepEqual(only(matchVoiceCommand("rest day")).arguments, { activity: "rest" });
  assert.deepEqual(only(matchVoiceCommand("avui faig força", "ca")).arguments, { activity: "strength" });
});

test("the basket and the day's remaining macros are read aloud by the app", () => {
  const basket = matchVoiceCommand("read me the shopping list");
  assert.deepEqual(only(basket), { name: "read_basket", arguments: { scope: "day" } });
  // `say` is null because only the app knows the live numbers.
  assert.equal(basket.say, null);
  assert.deepEqual(only(matchVoiceCommand("read me the shopping list for the week")).arguments, { scope: "week" });
  assert.deepEqual(normaliseVoiceAction({ name: "read_basket" }).arguments, { scope: "day" }, "no scope means today");
  assert.deepEqual(names(matchVoiceCommand("què em queda", "ca")), ["read_targets"]);
});

test("spoken setup answers fill in several profile fields at once", () => {
  const result = only(matchVoiceCommand("I am 34 years old, 178 cm and 74 kilos"));
  assert.equal(result.name, "set_profile");
  assert.deepEqual(result.arguments, { age: 34, heightCm: 178, weightKg: 74 });
  assert.deepEqual(only(matchVoiceCommand("tinc 40 anys", "ca")).arguments, { age: 40 });
  assert.deepEqual(only(matchVoiceCommand("I want to lose fat")).arguments, { goal: "lose" });
});

test("the usual week is answered in words, not in the four button labels", () => {
  assert.deepEqual(only(matchVoiceCommand("I mostly sit all day")).arguments, { activity: "sedentary" });
  assert.deepEqual(only(matchVoiceCommand("I am lightly active")).arguments, { activity: "light" });
  assert.deepEqual(only(matchVoiceCommand("I train regularly")).arguments, { activity: "moderate" });
  assert.deepEqual(only(matchVoiceCommand("entreno cada dia", "ca")).arguments, { activity: "high" });
});

test("today's movement and the usual week are told apart", () => {
  // "Today I'm running" sets the day; "I train regularly" answers setup.
  assert.equal(only(matchVoiceCommand("today I am running")).name, "set_training");
  assert.equal(only(matchVoiceCommand("I train regularly")).name, "set_profile");
});

test("confirmations are spoken in the language that was spoken to", () => {
  assert.equal(matchVoiceCommand("I ate lunch", "en").say, "Logged lunch.");
  assert.equal(matchVoiceCommand("he dinat", "ca").say, "He registrat el dinar.");
});

test("a real question is not forced into an action", () => {
  for (const sentence of ["how much protein is in a chickpea", "tell me a joke", "what should I cook for my mother", ""]) {
    assert.equal(matchVoiceCommand(sentence), null, sentence);
  }
});

test("erasing data is not reachable by voice", () => {
  assert.equal(Object.keys(VOICE_ACTIONS).some((name) => /delete|erase|clear|remove/.test(name)), false);
  assert.equal(normaliseVoiceAction({ name: "delete_data" }), null);
  assert.equal(matchVoiceCommand("delete everything"), null);
});

test("an action the catalogue does not define never survives validation", () => {
  assert.equal(normaliseVoiceAction({ name: "navigate", arguments: { view: "admin" } }), null);
  assert.equal(normaliseVoiceAction({ name: "log_meal", arguments: { meal: "lunch" } }), null, "a missing status is not a log");
  assert.equal(normaliseVoiceAction({ name: "set_profile", arguments: { weightKg: 900 } }), null, "out of range and nothing else left");
  assert.equal(normaliseVoiceAction({ name: "constructor" }), null, "no inherited property is an action");
  assert.equal(normaliseVoiceAction(null), null);
});

test("arguments are accepted nested or flattened, and unknown ones are dropped", () => {
  assert.deepEqual(normaliseVoiceAction({ name: "navigate", arguments: { view: "week" } }), { name: "navigate", arguments: { view: "week" } });
  assert.deepEqual(normaliseVoiceAction({ name: "navigate", view: "week" }), { name: "navigate", arguments: { view: "week" } });
  assert.deepEqual(normaliseVoiceAction({ name: "daily_check", url: "https://example.com" }), { name: "daily_check", arguments: {} });
});

test("numbers are coerced and rounded to the precision the field holds", () => {
  assert.deepEqual(normaliseVoiceAction({ name: "set_profile", weightKg: "74,45" }).arguments, { weightKg: 74.5 });
  assert.deepEqual(normaliseVoiceAction({ name: "set_profile", age: "34" }).arguments, { age: 34 });
});

test("a list of proposed actions is validated, deduplicated and capped", () => {
  const actions = normaliseVoiceActions([
    { name: "navigate", arguments: { view: "today" } },
    { name: "navigate", arguments: { view: "today" } },
    { name: "nonsense" },
    { name: "read_targets" },
    { name: "daily_check" },
    { name: "restart_day" },
  ]);
  assert.deepEqual(actions.map((action) => action.name), ["navigate", "read_targets", "daily_check"]);
  assert.ok(actions.length <= MAX_VOICE_ACTIONS);
  assert.deepEqual(normaliseVoiceActions("go away"), []);
  assert.deepEqual(normaliseVoiceActions(undefined), []);
});

test("stopping works on its own, in both languages", () => {
  assert.deepEqual(names(matchVoiceCommand("stop")), ["stop"]);
  assert.deepEqual(names(matchVoiceCommand("that's all")), ["stop"]);
  assert.deepEqual(names(matchVoiceCommand("prou", "ca")), ["stop"]);
});

/* ── The pre-rendered Catalan voice ──────────────────────────────────────
   Most phones have no Catalan voice, so the fixed sentences are rendered ahead
   of time by `scripts/build-catalan-voice.mjs` and looked up at runtime by
   their own text. That lookup is exact, so a sentence that drifts by one
   character silently loses its recording and falls back to a Spanish voice —
   which is the failure the whole thing exists to avoid. These tests are what
   makes that drift loud. */

test("every fixed sentence the Coach speaks is in the render catalogue", () => {
  const ca = spokenPhrases("ca");
  const en = spokenPhrases("en");
  assert.equal(ca.length, en.length, "the two languages must say the same number of things");
  assert.ok(ca.length >= 30, "the catalogue looks truncated");
  assert.equal(new Set(ca).size, ca.length, "a duplicate would be rendered twice");
  assert.equal(ca.some((phrase) => /\d/.test(phrase)), false, "a sentence with a number cannot be pre-rendered");
  assert.ok(ca.includes("Aquí tens la cistella."));
  assert.ok(ca.includes("He registrat el dinar."));
});

test("the confirmation the grammar returns is the one that was catalogued", () => {
  const ca = spokenPhrases("ca");
  for (const [sentence, language] of [["ves a la cistella", "ca"], ["he dinat", "ca"], ["avui corro", "ca"], ["prou", "ca"]]) {
    const spoken = matchVoiceCommand(sentence, language).say;
    assert.ok(ca.includes(spoken), `"${spoken}" is spoken but never rendered`);
  }
});

test("the app-composed replies still appear verbatim in coach.js", () => {
  // APP_REPLIES declares them so they get recorded; coach.js is where they are
  // actually said. Two copies of a string is exactly what drifts, so this is
  // the seam that gets checked rather than trusted.
  const source = fs.readFileSync(new URL("../public/coach.js", import.meta.url), "utf8");
  for (const [key, entry] of Object.entries(APP_REPLIES)) {
    if (key === "offline" || key === "unreachable") continue;   // said by voice.js
    assert.ok(source.includes(entry.en), `coach.js no longer says the English ${key}`);
    assert.ok(source.includes(entry.ca), `coach.js no longer says the Catalan ${key}`);
  }
});

test("the app-composed replies voice.js speaks come from the catalogue", () => {
  const source = fs.readFileSync(new URL("../public/voice.js", import.meta.url), "utf8");
  assert.ok(source.includes("APP_REPLIES.offline"), "voice.js should not hold its own copy of the offline sentence");
  assert.ok(source.includes("APP_REPLIES.unreachable"), "voice.js should not hold its own copy of the unreachable sentence");
});
