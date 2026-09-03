import { sendError, methodNotAllowed } from "../server/http.js";
import { COACH_GUARDRAILS, replyLanguage } from "../server/coach-guardrails.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1400;

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
  if (!process.env.OPENAI_API_KEY) return sendError(response, 503, "service_not_configured", "The live Coach is not configured yet.");

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
  const language = replyLanguage(body.language);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  // The Responses API types content by who said it: what the user typed is
  // `input_text`, what the model already said is `output_text`. Sending the
  // assistant's turns as `input_text` made every message after the first fail,
  // because the first request is the only one with no history to replay.
  const input = messages
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: [{ type: message.role === "assistant" ? "output_text" : "input_text", text: String(message.text ?? "").trim().slice(0, MAX_MESSAGE_LENGTH) }]
    }))
    .filter((message) => message.content[0].text);

  if (!input.length) return sendError(response, 400, "invalid_request", "Write a message for your Coach.");

  const instructions = [
    COACH_GUARDRAILS[0],
    `Reply in ${language}. Keep it concise (maximum 140 words) and conversational.`,
    ...COACH_GUARDRAILS.slice(1)
  ].join(" ");

  try {
    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions, input, max_output_tokens: 300, store: false })
    });
    const result = await openaiResponse.json().catch(() => ({}));
    const reply = textFromResponse(result);
    if (!openaiResponse.ok || !reply) {
      console.error("OpenAI Coach request failed", { status: openaiResponse.status, error: result?.error?.message, statusDetail: result?.status, outputTypes: result?.output?.map((item) => item?.type) });
      return sendError(response, 502, "upstream_unavailable", "The live Coach is temporarily unavailable. Please try again.");
    }
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ reply });
  } catch (error) {
    console.error("OpenAI Coach request failed", error);
    return sendError(response, 502, "upstream_unavailable", "The live Coach is temporarily unavailable. Please try again.");
  }
}
