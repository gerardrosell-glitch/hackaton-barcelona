const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/schnell";
const MAX_TITLE_LENGTH = 180;

function mealPrompt(title) {
  return [
    "Natural editorial food photography of a healthy Catalan Mediterranean meal:",
    title + ".",
    "Fresh whole ingredients, realistic portions, warm daylight, ceramic plate, soft apricot and olive palette.",
    "Overhead three-quarter composition, appetising but realistic, no people, no packaging, no logos, no text, no cutlery blocking the food."
  ].join(" ");
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  if (!process.env.FAL_KEY) return response.status(503).json({ error: "Meal-image generation is not configured yet." });

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body ?? {});
  const title = String(body.title ?? "").trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return response.status(400).json({ error: "Choose a valid meal before generating an image." });

  try {
    const falResponse = await fetch(FAL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: mealPrompt(title), image_size: "landscape_4_3", num_inference_steps: 4,
        num_images: 1, enable_safety_checker: true, output_format: "jpeg"
      })
    });
    const result = await falResponse.json().catch(() => ({}));
    const imageUrl = result?.images?.[0]?.url;
    if (!falResponse.ok || !imageUrl) {
      console.error("Fal meal image request failed", { status: falResponse.status, detail: result?.detail ?? result?.message });
      return response.status(502).json({ error: "Meal-image generation is temporarily unavailable." });
    }
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ imageUrl, provider: "fal", alt: title });
  } catch (error) {
    console.error("Fal meal image request failed", error);
    return response.status(502).json({ error: "Meal-image generation is temporarily unavailable." });
  }
}
