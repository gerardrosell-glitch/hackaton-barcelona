import crypto from "node:crypto";

// Call before trusting `logged_in_customer_id` or returning any profile data.
export function verifyShopifyProxySignature(query, sharedSecret) {
  const { signature, ...parameters } = query;
  if (!signature || !sharedSecret) return false;
  const message = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${Array.isArray(parameters[key]) ? parameters[key].join(",") : parameters[key]}`)
    .join("");
  const expected = crypto.createHmac("sha256", sharedSecret).update(message).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
