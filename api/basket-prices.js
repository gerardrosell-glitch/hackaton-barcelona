import { getBasketEstimate } from "../server/basket-pricing.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
    const estimate = await getBasketEstimate({ items: body.items, calaApiKey: process.env.CALA_API_KEY });
    response.setHeader("Cache-Control", "private, max-age=900");
    return response.status(200).json(estimate);
  } catch (error) {
    return response.status(400).json({ error: error.message || "Unable to estimate this basket." });
  }
}
