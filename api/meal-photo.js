import { analyseMealPhoto } from "../server/logmeal.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
    const result = await analyseMealPhoto(body.imageBase64, body.logmealConsent);
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json(result);
  } catch (error) {
    return response.status(/JPEG|Meal photos|Explicit LogMeal/.test(error.message) ? 422 : 503).json({ error: error.message });
  }
}
