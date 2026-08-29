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
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: "The live Coach is not configured yet." });

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
  const language = body.language === "ca" ? "Catalan" : "English";
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const input = messages
    .filter((message) => ["user", "assistant"].includes(message?.role))
    .map((message) => ({ role: message.role, content: [{ type: "input_text", text: String(message.text ?? "").trim().slice(0, MAX_MESSAGE_LENGTH) }] }))
    .filter((message) => message.content[0].text);

  if (!input.length) return response.status(400).json({ error: "Write a message for your Coach." });

  const instructions = [
    "You are the Quota Vita Coach, a friendly, practical nutrition companion.",
    `Reply in ${language}. Keep it concise (maximum 140 words) and conversational.`,
    "Give general wellbeing and healthy Catalan Mediterranean food guidance. You may explain the app's meal plan, offer practical swaps, training-fuel ideas, restaurant choices, grocery tips, and habit support.",
    "Never diagnose, treat, or claim medical certainty. Do not create meal plans for pregnancy, eating disorders, diabetes, kidney disease, allergies, or other medical conditions. For these, acknowledge the limitation and recommend an appropriate qualified clinician.",
    "Do not tell the user to change prescribed medication. Avoid extreme restriction, unsafe weight-loss advice, or shaming language.",
    "The app calculates calories and macros separately. Do not invent precise personalised calorie targets; explain that the displayed estimates are general wellbeing guidance.",
    "Do not ask for or repeat sensitive health information unless the user volunteers it."
  ].join(" ");

  try {
    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", instructions, input, max_output_tokens: 300, store: false })
    });
    const result = await openaiResponse.json().catch(() => ({}));
    const reply = textFromResponse(result);
    if (!openaiResponse.ok || !reply) {
      console.error("OpenAI Coach request failed", { status: openaiResponse.status, error: result?.error?.message });
      return response.status(502).json({ error: "The live Coach is temporarily unavailable. Please try again." });
    }
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ reply });
  } catch (error) {
    console.error("OpenAI Coach request failed", error);
    return response.status(502).json({ error: "The live Coach is temporarily unavailable. Please try again." });
  }
}
