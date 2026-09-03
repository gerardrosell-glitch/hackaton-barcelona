/**
 * public/voice-commands.js — what the Coach will do when it is spoken to.
 *
 * This file lives in `public/` because it is the one module both sides need.
 * The browser imports it to understand a command with no network at all, and
 * `api/voice.js` imports it to check what the language model asked for before
 * anything is allowed to run. One grammar, one allow-list, one set of spoken
 * confirmations — so the offline path and the model path cannot drift apart.
 *
 * Three rules shaped the catalogue below.
 *
 * A voice action is a whitelist, never a instruction the model can invent. The
 * model proposes a `name` and some arguments; `normaliseVoiceActions` throws
 * away anything that is not in this file, and every argument is checked against
 * its own enum or numeric range. An unknown action is dropped, not guessed at.
 *
 * Nothing destructive is reachable by voice. Erasing a person's data is a
 * deliberate, confirmed, two-step decision on a screen they can read; a
 * misheard sentence in a noisy kitchen must not be able to reach it. Restarting
 * the day is the furthest voice goes, and that keeps the saved profile.
 *
 * And every command has to work with no signal. The supermarket basement is
 * exactly where a shopping basket is read out and exactly where the network is
 * not, so `matchVoiceCommand` answers the common sentences locally, in both
 * languages, before the model is ever asked.
 */

export const VOICE_VIEWS = Object.freeze(["today", "week", "basket", "coach", "progress"]);
export const VOICE_MEALS = Object.freeze(["breakfast", "lunch", "dinner"]);
export const VOICE_MEAL_STATUSES = Object.freeze(["eaten", "skipped", "restaurant"]);
export const VOICE_ACTIVITIES = Object.freeze(["rest", "walk", "pilates", "strength", "run"]);
export const VOICE_LANGUAGES = Object.freeze(["en", "ca"]);

/** At most this many actions run from one sentence. One sentence, one intent. */
export const MAX_VOICE_ACTIONS = 3;

/** The longest spoken turn accepted. Anything past this is a transcription fault. */
export const MAX_TRANSCRIPT_LENGTH = 400;

const enumArg = (values) => Object.freeze({ kind: "enum", values: Object.freeze([...values]) });
const numberArg = (min, max, decimals = 0) => Object.freeze({ kind: "number", min, max, decimals });
const textArg = (maxLength) => Object.freeze({ kind: "text", maxLength });

/**
 * Every action the Coach can be told to take, and the only arguments each one
 * accepts. `required` names the arguments without which the action is
 * meaningless; the rest are optional and simply dropped when absent.
 */
export const VOICE_ACTIONS = Object.freeze({
  navigate: {
    description: "Open one of the Coach's screens.",
    args: { view: enumArg(VOICE_VIEWS) },
    required: ["view"],
  },
  log_meal: {
    description: "Record what happened with one of today's three meals.",
    args: { meal: enumArg(VOICE_MEALS), status: enumArg(VOICE_MEAL_STATUSES) },
    required: ["meal", "status"],
  },
  set_training: {
    description: "Set today's movement, which changes the calorie and macro target.",
    args: { activity: enumArg(VOICE_ACTIVITIES) },
    required: ["activity"],
  },
  set_profile: {
    description: "Fill in or correct part of the setup profile. Any subset of the fields.",
    args: {
      age: numberArg(18, 100),
      heightCm: numberArg(120, 230),
      weightKg: numberArg(35, 300, 1),
      sex: enumArg(["female", "male", ""]),
      activity: enumArg(["sedentary", "light", "moderate", "high"]),
      goal: enumArg(["lose", "gain", "maintain"]),
    },
    required: [],
  },
  read_targets: {
    description: "Say aloud what is left of today's calories and macros.",
    args: {},
    required: [],
  },
  read_meal: {
    description: "Say aloud one of today's meals and what goes in it.",
    args: { meal: enumArg(VOICE_MEALS) },
    required: ["meal"],
  },
  read_basket: {
    description: "Read the shopping basket aloud, item by item. Defaults to today's.",
    args: { scope: enumArg(["day", "week"]) },
    required: [],
    defaults: { scope: "day" },
  },
  daily_check: {
    description: "Open the end-of-day check.",
    args: {},
    required: [],
  },
  set_language: {
    description: "Switch the Coach between English and Catalan.",
    args: { language: enumArg(VOICE_LANGUAGES) },
    required: ["language"],
  },
  email_week: {
    description: "Open the form that emails the week's plan.",
    args: {},
    required: [],
  },
  download: {
    description: "Open the printable daily plan or shopping basket.",
    args: { kind: enumArg(["plan", "basket"]) },
    required: ["kind"],
  },
  restart_day: {
    description: "Re-ask today's movement and rebuild today's plan. Keeps the saved profile.",
    args: {},
    required: [],
  },
  edit_profile: {
    description: "Open the saved height, weight, age, activity and goal for editing.",
    args: {},
    required: [],
  },
  search: {
    description: "Search the plan, the week and the basket for a word.",
    args: { query: textArg(60) },
    required: ["query"],
  },
  stop: {
    description: "Stop listening and close voice control.",
    args: {},
    required: [],
  },
});

/** Accent- and punctuation-insensitive, so "proteïna" and "que" both match. */
export function foldSpeech(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coerceArgument(spec, value) {
  if (value === undefined || value === null) return undefined;
  if (spec.kind === "enum") {
    const text = String(value).trim().toLowerCase();
    return spec.values.includes(text) ? text : undefined;
  }
  if (spec.kind === "number") {
    const numeric = Number(String(value).replace(",", "."));
    if (!Number.isFinite(numeric) || numeric < spec.min || numeric > spec.max) return undefined;
    const factor = 10 ** spec.decimals;
    return Math.round(numeric * factor) / factor;
  }
  const text = String(value).trim().slice(0, spec.maxLength);
  return text || undefined;
}

/**
 * One proposed action in, one safe action out — or `null`. This is the only
 * gate between a language model's output and something happening in the app,
 * so it is deliberately unforgiving: unknown name, unknown argument, or a
 * missing required argument all mean the action does not exist.
 */
export function normaliseVoiceAction(value) {
  const name = String(value?.name ?? "").trim();
  const definition = Object.prototype.hasOwnProperty.call(VOICE_ACTIONS, name) ? VOICE_ACTIONS[name] : null;
  if (!definition) return null;

  // Arguments arrive either nested under `arguments` or flattened beside the
  // name, because models produce both shapes for the same schema.
  const source = value?.arguments && typeof value.arguments === "object" ? value.arguments : value;
  const args = {};
  for (const [key, spec] of Object.entries(definition.args)) {
    const coerced = coerceArgument(spec, source?.[key]);
    if (coerced !== undefined) args[key] = coerced;
  }
  for (const [key, fallback] of Object.entries(definition.defaults || {})) {
    if (args[key] === undefined) args[key] = fallback;
  }
  if (definition.required.some((key) => args[key] === undefined)) return null;
  /* An action that carries no argument the app can act on is not an action.
     `set_profile` with an out-of-range weight has lost the only thing it was
     asking for, and running it would silently do nothing at all. */
  if (!definition.required.length && Object.keys(definition.args).length && !Object.keys(args).length) return null;
  return { name, arguments: args };
}

/** The same gate for a list: validated, deduplicated and capped. */
export function normaliseVoiceActions(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set();
  const actions = [];
  for (const item of list) {
    const action = normaliseVoiceAction(item);
    if (!action) continue;
    const key = action.name + ":" + JSON.stringify(action.arguments);
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(action);
    if (actions.length >= MAX_VOICE_ACTIONS) break;
  }
  return actions;
}

const say = (en, ca) => ({ en, ca });

/* ── The offline grammar ─────────────────────────────────────────────────
   Written against the folded transcript, so no rule needs to carry accents
   or apostrophes. Each rule is tried in order and the first hit wins, which
   is why the specific sentences ("i ate out for lunch") sit above the general
   ones ("lunch"). */

const NAV_VERBS = "(?:go(?: back)?(?: to)?|open|show(?: me)?|take me(?: back)? to|switch to|jump to|see|view|ves a|ves|obre|obrir|mostra(?: m)?|porta m a|vull veure|ensenya m)";
const NAV_TAIL = "(?:\\s+(?:page|screen|tab|view|section|pantalla|pagina|seccio|pla))?";

const NAV_NOUNS = [
  ["today", "(?:today|todays plan|home|my day|avui|el dia|el pla d avui|pla d avui)"],
  ["week", "(?:the week|week|weekly plan|seven days|7 days|la setmana|setmana|pla setmanal|els set dies)"],
  ["basket", "(?:the basket|basket|shopping list|shopping|groceries|la cistella|cistella|llista de la compra|la compra|compra)"],
  ["coach", "(?:the coach|coach|chat|conversation|el coach|xat|conversa)"],
  ["progress", "(?:progress|my progress|streak|points|xp|badges|el progres|progres|ratxa|punts|insignies)"],
];

const MEAL_NOUNS = [
  ["breakfast", "(?:breakfast|esmorzar|l esmorzar|esmorzo)"],
  ["lunch", "(?:lunch|dinar|el dinar|dino)"],
  ["dinner", "(?:dinner|supper|sopar|el sopar|sopo)"],
];

const ACTIVITY_WORDS = [
  ["run", "(?:run|running|ran|a run|jog|jogging|corr(?:o|er|ent)|he corregut|cursa)"],
  ["strength", "(?:strength|weights|lifting|gym|the gym|forca|peses|gimnas|musculacio)"],
  ["pilates", "(?:pilates|yoga|ioga)"],
  ["walk", "(?:walk|walking|walked|a walk|caminar|camino|he caminat|passejar|passejada)"],
  ["rest", "(?:rest|resting|rest day|recovery|nothing|no training|descans|dia de descans|descansar|recuperacio|res|no entreno)"],
];

/** A rule is [pattern, build]. `build` returns { actions, say } or null. */
const RULES = [
  // Stop first: it has to work even when the rest of the sentence is noise.
  [/^(?:stop|stop listening|be quiet|quiet|that ?s all|that ?s it|thank you that ?s all|cancel|exit|close|goodbye|bye|para|atura t|atura|prou|ja esta|adeu|tanca|cancel a|gracies ja esta)$/,
    () => ({ actions: [{ name: "stop", arguments: {} }], say: say("Okay, I'll stop listening.", "D'acord, deixo d'escoltar.") })],

  [/\b(?:speak|switch to|answer in|talk to me in|in)\s+catalan\b|\bparla(?:m)?\s+en\s+catala\b|\ben\s+catala\b/,
    () => ({ actions: [{ name: "set_language", arguments: { language: "ca" } }], say: say("Switching to Catalan.", "Canvio al català.") })],
  [/\b(?:speak|switch to|answer in|talk to me in|in)\s+english\b|\bparla(?:m)?\s+en\s+angles\b|\ben\s+angles\b/,
    () => ({ actions: [{ name: "set_language", arguments: { language: "en" } }], say: say("Switching to English.", "Canvio a l'anglès.") })],

  // Reading things out. The whole point of hands-free: cooking, or in a shop.
  [/\b(?:read|read out|whats on|what is on|what do i need to buy|what should i buy)\b.*\b(?:basket|shopping list|list)\b|\b(?:llegeix|llegeix me|digue m)\b.*\b(?:cistella|llista|compra)\b|\bque he de comprar\b/,
    (folded) => ({
      actions: [{ name: "read_basket", arguments: { scope: /\b(?:week|weekly|setmana|setmanal)\b/.test(folded) ? "week" : "day" } }],
      say: null,
    })],
  [/\b(?:how (?:am i doing|much .* left|many .* left)|whats left|what is left|what do i have left|read (?:me )?my targets?|hows my day)\b|\b(?:com vaig|que em queda|quant em queda|quanta proteina em queda|com va el dia|llegeix me els objectius)\b/,
    () => ({ actions: [{ name: "read_targets", arguments: {} }], say: null })],

  // "What's for dinner" must be read before the navigation noun "dinner".
  [/\b(?:what ?s|what is|what am i having|what do i (?:eat|have)|read|tell me about)\b[^.]*\b(?:for )?(breakfast|lunch|dinner|supper|esmorzar|dinar|sopar)\b|\bque\s+(?:hi ha per |menjo per |toca per )?(esmorzar|dinar|sopar|esmorzo|dino|sopo)\b/,
    (folded, match) => {
      const meal = mealFromWord(match[1] || match[2]);
      return meal ? { actions: [{ name: "read_meal", arguments: { meal } }], say: null } : null;
    }],

  // Logging. "ate out" and "skipped" have to beat the plain "ate".
  [/\b(?:i )?(?:ate out|ate at a restaurant|had a restaurant|went out) (?:for )?(?:my )?(breakfast|lunch|dinner|supper)\b|\b(?:he menjat fora|he anat al restaurant|al restaurant) (?:per |a )?(?:l |el )?(esmorzar|dinar|sopar)\b/,
    (folded, match) => logMeal(match[1] || match[2], "restaurant")],
  [/\b(?:i )?(?:skipped|skip|didnt eat|did not eat|missed) (?:my |the )?(breakfast|lunch|dinner|supper)\b|\b(?:m he saltat|no he menjat|salta t) (?:l |el )?(esmorzar|dinar|sopar)\b/,
    (folded, match) => logMeal(match[1] || match[2], "skipped")],
  [/\b(?:i )?(?:ate|had|eaten|have eaten|finished|just ate|log|logged|mark) (?:my |the )?(breakfast|lunch|dinner|supper)\b|\b(?:he menjat|m he menjat|he acabat|registra|apunta) (?:l |el )?(esmorzar|dinar|sopar)\b/,
    (folded, match) => logMeal(match[1] || match[2], "eaten")],
  [/^(?:i have |i ve |ja )?(?:he esmorzat|he dinat|he sopat|esmorzat|dinat|sopat)$/,
    (folded) => logMeal(/esmorzat/.test(folded) ? "esmorzar" : /dinat/.test(folded) ? "dinar" : "sopar", "eaten")],

  [/\b(?:daily check|close the day|finish (?:the|my) day|end of day|check my day)\b|\b(?:revisio del dia|tanca el dia|acaba el dia|revisa el dia)\b/,
    () => ({ actions: [{ name: "daily_check", arguments: {} }], say: say("Opening today's check.", "Obro la revisió del dia.") })],
  [/\b(?:email|send)\b[^.]*\b(?:week|weekly)\b|\b(?:envia m|envia|manda m)\b[^.]*\b(?:setmana|setmanal)\b/,
    () => ({ actions: [{ name: "email_week", arguments: {} }], say: say("Opening the email form for your week.", "Obro el formulari per enviar-te la setmana.") })],
  [/\b(?:download|print|save|pdf)\b[^.]*\b(?:basket|shopping list|cistella|compra)\b|\b(?:baixa|imprimeix|desa)\b[^.]*\b(?:cistella|compra)\b/,
    () => ({ actions: [{ name: "download", arguments: { kind: "basket" } }], say: say("Opening your basket to print.", "Obro la cistella per imprimir.") })],
  [/\b(?:download|print|save|pdf)\b[^.]*\b(?:plan|today|meals?)\b|\b(?:baixa|imprimeix|desa)\b[^.]*\b(?:pla|apats|avui)\b/,
    () => ({ actions: [{ name: "download", arguments: { kind: "plan" } }], say: say("Opening today's plan to print.", "Obro el pla d'avui per imprimir.") })],
  [/\b(?:start over|restart(?: the| my)? day|reset(?: the| my)? day|new day|do today again)\b|\b(?:comenca de nou|reinicia el dia|torna a comencar|refes el dia)\b/,
    () => ({ actions: [{ name: "restart_day", arguments: {} }], say: say("Starting today again. Your profile is kept.", "Torno a començar el dia. El teu perfil es manté.") })],
  [/\b(?:my details|edit (?:my )?(?:profile|details)|change my (?:weight|height|age|goal)|update my (?:weight|height|age|goal))\b|\b(?:les meves dades|edita(?: el)? perfil|canvia el meu (?:pes|objectiu)|actualitza el meu (?:pes|objectiu))\b/,
    () => ({ actions: [{ name: "edit_profile", arguments: {} }], say: say("Opening your details.", "Obro les teves dades.") })],

  [/\b(?:search for|find|look for)\s+(.{2,60})$|\b(?:cerca|busca|troba)\s+(.{2,60})$/,
    (folded, match) => {
      const query = (match[1] || match[2] || "").trim();
      return query ? { actions: [{ name: "search", arguments: { query } }], say: null } : null;
    }],
];

function mealFromWord(word) {
  const folded = foldSpeech(word);
  for (const [meal, pattern] of MEAL_NOUNS) {
    if (new RegExp("^" + pattern + "$").test(folded)) return meal;
  }
  return null;
}

function logMeal(word, status) {
  const meal = mealFromWord(word);
  if (!meal) return null;
  const labels = {
    breakfast: ["breakfast", "l'esmorzar"],
    lunch: ["lunch", "el dinar"],
    dinner: ["dinner", "el sopar"],
  }[meal];
  const spoken = {
    eaten: say("Logged " + labels[0] + ".", "He registrat " + labels[1] + "."),
    skipped: say("Noted, you skipped " + labels[0] + ".", "Apuntat, t'has saltat " + labels[1] + "."),
    restaurant: say("Logged " + labels[0] + " out.", "He registrat " + labels[1] + " fora."),
  }[status];
  return { actions: [{ name: "log_meal", arguments: { meal, status } }], say: spoken };
}

function matchNavigation(folded) {
  for (const [view, pattern] of NAV_NOUNS) {
    const withVerb = new RegExp("^" + NAV_VERBS + "\\s+(?:the\\s+|my\\s+|la\\s+|el\\s+|els\\s+|les\\s+|meu\\s+|meva\\s+)?" + pattern + NAV_TAIL + "$");
    const bare = new RegExp("^" + pattern + NAV_TAIL + "$");
    if (withVerb.test(folded) || bare.test(folded)) {
      const spoken = {
        today: say("Here's today.", "Aquí tens avui."),
        week: say("Here's your week.", "Aquí tens la setmana."),
        basket: say("Here's your basket.", "Aquí tens la cistella."),
        coach: say("I'm listening.", "T'escolto."),
        progress: say("Here's your progress.", "Aquí tens el teu progrés."),
      }[view];
      return { actions: [{ name: "navigate", arguments: { view } }], say: spoken };
    }
  }
  return null;
}

function matchTraining(folded) {
  const declares = /\b(?:today i(?: am|m)?|im|i am|i did|i went for|ive done|i have done|set (?:my )?training to|training is|todays training is|make (?:it|today) a?|its a)\b|\b(?:avui|he fet|faig|entreno|entrenament|posa)\b/.test(folded);
  if (!declares && !/^(?:rest|rest day|descans|dia de descans)$/.test(folded)) return null;
  for (const [activity, pattern] of ACTIVITY_WORDS) {
    if (new RegExp("(?:^|\\s)" + pattern + "(?:\\s|$)").test(folded)) {
      const spoken = {
        run: say("Set to a run. Your plan is rebuilt.", "Avui corres. Refaig el pla."),
        strength: say("Set to strength. Your plan is rebuilt.", "Avui fas força. Refaig el pla."),
        pilates: say("Set to pilates. Your plan is rebuilt.", "Avui fas pilates. Refaig el pla."),
        walk: say("Set to a walk. Your plan is rebuilt.", "Avui camines. Refaig el pla."),
        rest: say("A rest day it is. Your plan is rebuilt.", "Dia de descans. Refaig el pla."),
      }[activity];
      return { actions: [{ name: "set_training", arguments: { activity } }], say: spoken };
    }
  }
  return null;
}

/**
 * Spoken numbers during setup — "I'm thirty four" arrives from the browser as
 * "34", so only digits need reading. Each unit is matched independently so one
 * sentence can answer three questions at once.
 */
function matchProfileFacts(folded) {
  const args = {};
  const age = /(\d{2,3})\s*(?:years? old|year old|yo|anys)\b/.exec(folded)
    || /^(?:i am|im|tinc|soc)\s+(\d{2,3})$/.exec(folded);
  const height = /(\d{3})\s*(?:cm|centimet\w*|centimetres|centimeters)\b/.exec(folded)
    || /(?:height|tall|alcada|faig)\D{0,12}(\d{3})\b/.exec(folded);
  const weight = /(\d{2,3}(?:\s\d)?)\s*(?:kg|kilo\w*|kilograms?)\b/.exec(folded)
    || /(?:weigh|weight|peso|pes)\D{0,12}(\d{2,3})\b/.exec(folded);
  if (age) args.age = Number(age[1]);
  if (height) args.heightCm = Number(height[1]);
  // "74 5 kilos" is how a browser hands back "74.5 kilos" once folded.
  if (weight) args.weightKg = Number(String(weight[1]).replace(/\s(\d)$/, ".$1"));

  if (/\b(?:im a woman|i am a woman|female|dona|soc dona)\b/.test(folded)) args.sex = "female";
  else if (/\b(?:im a man|i am a man|male|home|soc home)\b/.test(folded)) args.sex = "male";

  /* The usual-week question, in the words people answer it with rather than the
     four labels on the buttons. "I train regularly" is nobody's idea of an enum. */
  if (/\b(?:frequent training|i train every day|train every day|five days|six days|very active|molt actiu|entreno cada dia|entreno cinc)\b/.test(folded)) args.activity = "high";
  else if (/\b(?:regular training|i train regularly|train regularly|three or four days|3 or 4 days|entreno regularment|entreno sovint|forca actiu)\b/.test(folded)) args.activity = "moderate";
  else if (/\b(?:lightly active|light exercise|i walk a bit|a bit of exercise|una mica actiu|poc actiu|camino una mica)\b/.test(folded)) args.activity = "light";
  else if (/\b(?:mostly sit\\w*|sit all day|sitting all day|sedentary|no exercise|i don t exercise|assegut|sedentari|no faig exercici)\b/.test(folded)) args.activity = "sedentary";

  if (/\b(?:lose (?:fat|weight)|slim down|perdre (?:greix|pes)|aprimar me)\b/.test(folded)) args.goal = "lose";
  else if (/\b(?:gain (?:muscle|weight)|build muscle|guanyar (?:muscul|pes)|agafar muscul)\b/.test(folded)) args.goal = "gain";
  else if (/\b(?:maintain|stay the same|mantenir|mantenir me)\b/.test(folded)) args.goal = "maintain";

  if (!Object.keys(args).length) return null;
  return {
    actions: [{ name: "set_profile", arguments: args }],
    say: say("Got it.", "Entesos."),
  };
}

/**
 * The offline path. Returns `{ actions, say }` when the sentence is one the
 * Coach already understands on its own, and `null` when it needs the model.
 *
 * `say` may be `null`, which means "the app composes the answer" — reading the
 * basket or the remaining macros aloud needs live numbers this file cannot see.
 */
export function matchVoiceCommand(transcript, language = "en") {
  const folded = foldSpeech(transcript);
  if (!folded) return null;
  const pick = (result) => (result ? { actions: normaliseVoiceActions(result.actions), say: result.say ? result.say[language === "ca" ? "ca" : "en"] : null } : null);

  for (const [pattern, build] of RULES) {
    const match = pattern.exec(folded);
    if (!match) continue;
    const result = build(folded, match);
    if (result) return pick(result);
  }
  return pick(matchNavigation(folded)) || pick(matchTraining(folded)) || pick(matchProfileFacts(folded));
}

/** What the voice sheet offers as examples, and what the model is told exists. */
export const VOICE_EXAMPLES = Object.freeze({
  en: Object.freeze([
    "Open my basket",
    "I ate lunch",
    "What's for dinner?",
    "How much protein do I have left?",
    "Today I'm running",
    "Read me the shopping list",
  ]),
  ca: Object.freeze([
    "Obre la cistella",
    "He dinat",
    "Què hi ha per sopar?",
    "Quanta proteïna em queda?",
    "Avui corro",
    "Llegeix-me la llista de la compra",
  ]),
});
