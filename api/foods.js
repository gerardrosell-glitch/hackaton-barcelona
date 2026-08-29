import { searchFoods } from "../server/fatsecret.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed." });
  try {
    const url = new URL(request.url, "https://coach.quotavita.com");
    const result = await searchFoods({ search: url.searchParams.get("q"), region: url.searchParams.get("region") ?? "ES", language: url.searchParams.get("language") ?? "es" });
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json(result);
  } catch (error) {
    return response.status(/Enter between/.test(error.message) ? 422 : 503).json({ error: error.message });
  }
}
