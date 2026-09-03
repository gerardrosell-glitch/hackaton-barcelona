import { sendError, methodNotAllowed } from "../server/http.js";
import { COACH_GUARDRAILS, replyLanguage } from "../server/coach-guardrails.js";
import { VOICE_ACTIONS, MAX_TRANSCRIPT_LENGTH, MAX_VOICE_ACTIONS, normaliseVoiceActions } from "../public/voice-commands.js";

/**
 * /api/voice — one spoken sentence in, one spoken answer and up to three
 * checked actions out.
 *
 * The browser has already tried its own grammar before calling this, so what
 * arrives here is the long tail: everything phrased in a way no regular
 * expression was going to catch, and everything that is really a question
 * rather than a command. The model gets a compact picture of the screen the
 * person is looking at, and answers with `say` — what the Coach should speak —
 * plus `actions`, which is a proposal and nothing more. `normaliseVoiceActions`
 * is what decides whether any of it is allowed to happen.
 *
 * The route never sends a name, an email or a device identifier. What travels
 * is the sentence, the language, and the numbers already on the screen.
 */

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_HISTORY = 6;
const MAX_HISTORY_LENGTH = 300;

/** The action catalogue, rendered for the prompt straight from its definition. */
const ACTION_CATALOGUE = Object.entries(VOICE_ACTIONS)
  .map(([name, definition]) => {
    const args = Object.entries(definition.args).map(([key, spec]) => {
      const shape = spec.kind === "enum" ? spec.values.map((value) => (value === "" ? '""' : value)).join("|")
        : spec.kind === "number" ? `number ${spec.min}-${spec.max}`
          : `text, max ${spec.maxLength} characters`;
      return `${key}: ${shape}${definition.required.includes(key) ? " (required)" : ""}`;
    });
    return `- ${name}(${args.join("; ") || "no arguments"}) — ${definition.description}`;
  })
  .join("\n");

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["say"],
  properties: {
    say: { type: "string", maxLength: 400, description: "What the Coach speaks aloud. One or two sentences." },
    actions: {
      type: "array",
      maxItems: MAX_VOICE_ACTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", enum: Object.keys(VOICE_ACTIONS) },
          arguments: { type: "object", additionalProperties: true },
        },
      },
    },
  },
};

/** The screen the person is looking at, in as few words as the model needs. */
function describeContext(context) {
  if (!context || typeof context !== "object") return "The person has not set up a profile yet.";
  const lines = [];
  lines.push(`Screen: ${["today", "week", "basket", "coach", "progress", "setup"].includes(context.view) ? context.view : "today"}.`);
  if (!context.hasProfile) {
    lines.push("They have not finished setup. Only set_profile, set_training, set_language and stop can help them right now.");
    return lines.join(" ");
  }
  if (context.activity) lines.push(`Today's movement: ${String(context.activity).slice(0, 20)}.`);
  if (context.remaining && typeof context.remaining === "object") {
    const { calories, proteinG, carbohydrateG, fatG } = context.remaining;
    lines.push(`Still to eat today: ${Math.round(Number(calories) || 0)} kcal, ${Math.round(Number(proteinG) || 0)} g protein, ${Math.round(Number(carbohydrateG) || 0)} g carbohydrate, ${Math.round(Number(fatG) || 0)} g fat.`);
  }
  const meals = Array.isArray(context.meals) ? context.meals.slice(0, 3) : [];
  if (meals.length) {
    lines.push("Today's meals: " + meals
      .map((meal) => `${String(meal?.id || "").slice(0, 12)} — ${String(meal?.title || "").slice(0, 80)} (${String(meal?.status || "not logged").slice(0, 20)})`)
      .join("; ") + ".");
  }
  return lines.join(" ");
}

function parseModelReply(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // A model that answers in prose has still answered. Speak it, act on nothing.
    return { say: trimmed.slice(0, 400), actions: [] };
  }
}

function textFromResponse(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  return (result?.output || []).flatMap((item) => item?.content || [])
    .filter((item) => item?.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
  const transcript = String(body.transcript ?? "").trim().slice(0, MAX_TRANSCRIPT_LENGTH);
  if (!transcript) return sendError(response, 400, "invalid_request", "Send the words that were spoken.");

  const code = body.language === "ca" ? "ca" : "en";
  if (!process.env.OPENAI_API_KEY) {
    return sendError(response, 503, "service_not_configured", "Spoken questions need the live Coach, which is not configured yet. Direct commands still work.");
  }

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-MAX_HISTORY)
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: [{ type: message.role === "assistant" ? "output_text" : "input_text", text: String(message.text ?? "").trim().slice(0, MAX_HISTORY_LENGTH) }],
    }))
    .filter((message) => message.content[0].text);

  const instructions = [
    ...COACH_GUARDRAILS,
    `You are being spoken to out loud and your answer is read back by a speech synthesiser, in ${replyLanguage(code)}.`,
    "Write `say` for the ear, not the eye: at most two short sentences, no markdown, no lists, no emoji, no URLs. Numbers as words the synthesiser can read naturally.",
    "You may also propose actions that the app will carry out. Only these exist:",
    ACTION_CATALOGUE,
    "Propose an action only when the person clearly asked for it. A question deserves an answer, not a screen change. When you propose one, `say` should be the confirmation a person would expect to hear, not a description of what you did.",
    "For read_targets, read_meal and read_basket the app speaks the numbers itself, so keep `say` to a short lead-in or leave it empty.",
    "Never propose an action that erases data; that is not something this app does by voice, and if asked, say it has to be done on screen.",
    "Speech recognition mishears. If the sentence could plausibly be two different commands, ask which one instead of guessing.",
    "Answer as JSON matching the schema. No other text.",
  ].join("\n");

  const input = [...history, { role: "user", content: [{ type: "input_text", text: `${describeContext(body.context)}\n\nThey said: ${transcript}` }] }];

  try {
    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions,
        input,
        max_output_tokens: 400,
        store: false,
        text: { format: { type: "json_schema", name: "voice_reply", strict: false, schema: RESPONSE_SCHEMA } },
      }),
    });
    const result = await openaiResponse.json().catch(() => ({}));
    const parsed = openaiResponse.ok ? parseModelReply(textFromResponse(result)) : null;
    if (!parsed) {
      console.error("Voice interpretation failed", { status: openaiResponse.status, error: result?.error?.message, statusDetail: result?.status });
      return sendError(response, 502, "upstream_unavailable", "The Coach could not answer that just now. Please try again.");
    }

    const actions = normaliseVoiceActions(parsed.actions);
    const spoken = String(parsed.say ?? "").trim().slice(0, 400);
    if (!spoken && !actions.length) {
      return sendError(response, 502, "upstream_unavailable", "The Coach could not answer that just now. Please try again.");
    }

    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ say: spoken, actions });
  } catch (error) {
    console.error("Voice interpretation failed", error);
    return sendError(response, 502, "upstream_unavailable", "The Coach could not answer that just now. Please try again.");
  }
}
