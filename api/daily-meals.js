const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const CALA_QUERY_URL = "https://api.cala.ai/v1/knowledge/query";
const SLOTS = ["Breakfast", "Lunch", "Dinner"];

function textFromResponse(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  return (result?.output || []).flatMap((item) => item?.content || [])
    .filter((item) => item?.type === "output_text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function jsonFromText(text) {
  const source = String(text || "");
  const candidates = [source, ...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi).map((match) => match[1])];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* Try the next candidate. */ }
  }
  return null;
}

function cleanMeals(value) {
  if (!Array.isArray(value) || value.length !== SLOTS.length) return null;
  const meals = value.map((meal, index) => {
    const title = String(meal?.title || "").trim().slice(0, 140);
    const portions = String(meal?.portions || "").trim().slice(0, 280);
    const hint = String(meal?.hint || "").trim().slice(0, 180);
    const catalanName = String(meal?.catalanName || "").trim().slice(0, 120);
    if (!title || !portions || !hint) return null;
    return { slot: SLOTS[index], title, portions, hint, catalanName, milkshakeEligible: Boolean(meal?.milkshakeEligible) };
  });
  if (!meals.every(Boolean)) return null;
  const eligible = meals.filter((meal) => meal.milkshakeEligible);
  if (eligible.length !== 1) meals.forEach((meal, index) => { meal.milkshakeEligible = index === 1; });
  return meals;
}

function validTarget(target) {
  const calories = Number(target?.calories);
  const proteinG = Number(target?.proteinG);
  const carbohydrateG = Number(target?.carbohydrateG);
  const fatG = Number(target?.fatG);
  if (![calories, proteinG, carbohydrateG, fatG].every(Number.isFinite)) return null;
  if (calories < 1000 || calories > 6000 || proteinG < 40 || proteinG > 300 || carbohydrateG < 0 || carbohydrateG > 1000 || fatG < 20 || fatG > 250) return null;
  return { calories, proteinG, carbohydrateG, fatG };
}

async function calaDishContext(apiKey) {
  if (!apiKey) return "";
  try {
    const result = await fetch(CALA_QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ input: "List up to eight familiar Catalan or Mediterranean protein-centred dishes and their core ingredients. Return concise JSON only; do not include health claims." })
    });
    if (!result.ok) return "";
    const payload = await result.json().catch(() => ({}));
    return JSON.stringify(payload).slice(0, 2400);
  } catch {
    return "";
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: "Varied meal generation is not configured yet." });

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
  const target = validTarget(body.target);
  const activity = ["rest", "walk", "pilates", "strength", "run"].includes(body.activity) ? body.activity : null;
  const goal = ["lose", "gain", "maintain"].includes(body.goal) ? body.goal : "maintain";
  const usualActivity = ["sedentary", "light", "moderate", "high"].includes(body.usualActivity) ? body.usualActivity : "light";
  const language = body.language === "ca" ? "Catalan" : "English";
  if (!target || !activity) return response.status(400).json({ error: "Use a valid daily plan request." });

  const calaContext = await calaDishContext(process.env.CALA_API_KEY);
  const instructions = [
    "You create varied, practical Quota Vita daily meal ideas for general wellbeing, never medical treatment.",
    `Write all user-facing meal content in ${language}. Use natural Catalan/Mediterranean food when appropriate.`,
    "Return JSON only, with this exact shape: {\"meals\":[{\"slot\":\"Breakfast\",\"title\":string,\"portions\":string,\"hint\":string,\"catalanName\":string,\"milkshakeEligible\":boolean},{...Lunch},{...Dinner}]}. Use exactly three meals in Breakfast, Lunch, Dinner order.",
    "Portions must be a concise ingredient line with amounts. Titles, portions and hints must be appropriate to the supplied daily target and activity, but do not state medical claims or exact macro values.",
    "Make this menu materially different from a generic yogurt/chickpea/lentil template. Include exactly one milkshakeEligible true value; it marks only the meal whose protein component may be replaced by a Quota Vita Milkshake. The client calculates the serving amount separately at 24 g protein per 100 ml.",
    "Avoid allergies, pregnancy, clinical conditions, supplements other than the explicitly requested milkshake, extreme restriction, and any unsafe advice.",
    calaContext ? "Cala knowledge context follows. Use it only to choose plausible familiar Catalan dishes; do not claim Cala has independently verified the final plan: " + calaContext : ""
  ].filter(Boolean).join(" ");

  try {
    const openaiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ target, activity, goal, usualActivity, variationSeed: Number(body.variationSeed) || 0 }) }] }],
        max_output_tokens: 850,
        store: false
      })
    });
    const result = await openaiResponse.json().catch(() => ({}));
    const meals = cleanMeals(jsonFromText(textFromResponse(result))?.meals);
    if (!openaiResponse.ok || !meals) return response.status(502).json({ error: "Varied meal generation is temporarily unavailable." });
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ meals, calaAvailable: Boolean(calaContext) });
  } catch (error) {
    console.error("Daily meal generation failed", error);
    return response.status(502).json({ error: "Varied meal generation is temporarily unavailable." });
  }
}
