#!/usr/bin/env node
/**
 * Local development server for the Coach.
 *
 * The reason this exists: the app's pictures, meal plans, Coach replies and
 * basket prices all come from /api routes that need FAL_KEY, OPENAI_API_KEY and
 * the rest. A plain static server has none of them, so every meal renders
 * "Meal image unavailable" and the day never personalises — which looks like a
 * bug in the app and is really a missing key.
 *
 * So this server serves the real shell and the real public/ files from disk,
 * and forwards every /api call to production, which has the keys. Nothing
 * secret ends up on the laptop and localhost behaves like the live site.
 *
 *   npm run dev                  → http://localhost:4321
 *   npm run dev -- --port 3000   → another port
 *   COACH_DEV_API=http://localhost:3000 npm run dev   → point the API elsewhere
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf("--" + name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const PORT = Number(flag("port", process.env.PORT || 4321));
const API_ORIGIN = (process.env.COACH_DEV_API || flag("api", "https://coach.quotavita.com")).replace(/\/$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

/** Vercel handlers expect response.status(...).send(...); node's does not. */
function vercelResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.end(body); return res; };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

const readBody = (req) => new Promise((resolve) => {
  let data = "";
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => resolve(data));
});

async function proxyApi(req, res) {
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  try {
    const upstream = await fetch(API_ORIGIN + req.url, {
      method: req.method,
      headers: { "Content-Type": req.headers["content-type"] || "application/json" },
      body
    });
    const payload = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
    res.end(payload);
  } catch (error) {
    console.error("  ! api proxy failed:", req.url, error.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "dev_proxy_unavailable", message: "Could not reach " + API_ORIGIN }));
  }
}

function serveFile(file, res) {
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) return proxyApi(req, res);

  // Static files come from public/, exactly as they do in production.
  const candidate = path.join(ROOT, "public", url.pathname);
  if (candidate.startsWith(path.join(ROOT, "public")) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return serveFile(candidate, res);
  }

  // Everything else is a page: render it with the real handler so the shell,
  // the metadata and the server-rendered homepage match what ships.
  const route = url.pathname === "/" ? "index" : url.pathname.replace(/^\/+|\/+$/g, "");
  for (const module of [`../api/${route}.js`, "../api/index.js"]) {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), module);
    if (!fs.existsSync(file)) continue;
    try {
      const handler = (await import(file + "?t=" + Date.now())).default;
      return handler(req, vercelResponse(res));
    } catch (error) {
      console.error("  ! handler failed:", route, error.message);
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Handler error: " + error.message);
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Coach dev server  →  http://localhost:${PORT}`);
  console.log(`API calls proxied →  ${API_ORIGIN}`);
  console.log("Meal images, Coach replies and basket prices use the live keys; nothing is stored locally.\n");
});
