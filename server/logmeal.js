const SEGMENTATION_URL = "https://api.logmeal.com/v2/image/segmentation/complete";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function imageFromBase64(imageBase64) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(imageBase64 ?? ""));
  if (!match) throw new Error("Use a JPEG, PNG, or WebP meal photo.");
  const content = Buffer.from(match[2], "base64");
  if (!content.length || content.length > MAX_IMAGE_BYTES) throw new Error("Meal photos must be smaller than 8 MB.");
  return { content, type: match[1] };
}

export async function analyseMealPhoto(imageBase64, logmealConsent) {
  if (logmealConsent !== true) throw new Error("Explicit LogMeal photo-analysis authorisation is required.");
  if (process.env.LOGMEAL_IMAGE_ANALYSIS_ENABLED !== "true") {
    throw new Error("Restaurant photo analysis is not enabled in this production version.");
  }
  if (process.env.LOGMEAL_DPA_APPROVED !== "true") {
    throw new Error("Restaurant photo analysis is not enabled in this production version.");
  }
  const token = process.env.LOGMEAL_API_USER_TOKEN || process.env.LOGMEAL_API_TOKEN;
  if (!token) throw new Error("Restaurant photo analysis is not configured.");
  const image = imageFromBase64(imageBase64);
  const form = new FormData();
  form.append("image", new Blob([image.content], { type: image.type }), "meal-photo");
  const response = await fetch(SEGMENTATION_URL, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    console.error("LogMeal image analysis failed", { status: response.status, detail });
    const messages = {
      400: "LogMeal could not read this photo. Choose a clear JPEG, PNG, or WebP meal photo and try again.",
      401: "Restaurant photo analysis needs a valid LogMeal APIUser token in production.",
      403: "The configured LogMeal APIUser does not have permission for photo analysis.",
      429: "Restaurant photo analysis has reached its LogMeal usage limit. Please try again later."
    };
    throw new Error(messages[response.status] || "Restaurant photo analysis is temporarily unavailable.");
  }
  return { provider: "LogMeal", result: await response.json(), retention: "The image is not stored by Quota Vita." };
}
