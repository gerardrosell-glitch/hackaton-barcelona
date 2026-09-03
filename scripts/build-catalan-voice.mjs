#!/usr/bin/env node
/**
 * Render the Coach's fixed Catalan sentences with a real Catalan voice.
 *
 * Why this exists. The browser's own speech synthesiser has no Catalan voice on
 * most phones, so `voice.js` falls back to a Spanish one, which reads Catalan
 * the way an English voice reads French. Every sentence the Coach says without
 * consulting a live number is a fixed, finite set — thirty-six of them — so
 * they can be spoken once, properly, and shipped as audio.
 *
 * This runs on a laptop, never in a request. The result is static files in
 * `public/audio/ca/` plus a manifest the player looks sentences up in. Nothing
 * about a person's voice or data is involved: the input is the app's own copy.
 *
 *   HF_TOKEN=hf_… node scripts/build-catalan-voice.mjs
 *   HF_TOKEN=hf_… node scripts/build-catalan-voice.mjs --check   # what is missing
 *
 * The model is Matxa, from the Barcelona Supercomputing Center's Projecte Aina:
 * the first Catalan synthesiser covering central, north-western, Balearic and
 * Valencian. Set MATXA_ENDPOINT to the inference endpoint you have access to.
 *
 * Missing audio is never fatal. `voice.js` plays what the manifest has and
 * synthesises the rest, so the app ships correctly before this is ever run.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spokenPhrases } from "../public/voice-commands.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "audio", "ca");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

const ENDPOINT = process.env.MATXA_ENDPOINT || "https://x6g02u4lkf25gcjo.us-east-1.aws.endpoints.huggingface.cloud";
const VOICE = process.env.MATXA_VOICE || "central";
const checkOnly = process.argv.includes("--check");

/** A stable name from the sentence, so editing the copy retires its recording. */
const fileNameFor = (text) => crypto.createHash("sha256").update(VOICE + "\n" + text).digest("hex").slice(0, 16) + ".wav";

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  } catch {
    return { voice: VOICE, files: {} };
  }
}

async function synthesise(text) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "application/json", Accept: "audio/wav" },
    body: JSON.stringify({ inputs: text, parameters: { voice: VOICE } }),
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`);
  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) throw new Error(`endpoint returned JSON, not audio: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

const phrases = spokenPhrases("ca");
const manifest = await readManifest();
if (manifest.voice !== VOICE) manifest.files = {};   // A new voice retires every recording.
manifest.voice = VOICE;

// A sentence that was edited leaves its old recording behind; drop those first.
const wanted = new Map(phrases.map((text) => [text, fileNameFor(text)]));
for (const text of Object.keys(manifest.files)) {
  if (!wanted.has(text)) delete manifest.files[text];
}

const missing = phrases.filter((text) => manifest.files[text] !== wanted.get(text));
console.log(`${phrases.length} fixed Catalan sentences · ${phrases.length - missing.length} already rendered · ${missing.length} to do`);

if (checkOnly) {
  missing.forEach((text) => console.log("  missing:", text));
  process.exit(0);
}
if (!missing.length) process.exit(0);
if (!process.env.HF_TOKEN) {
  console.error("\nHF_TOKEN is not set. Create a token at https://huggingface.co/settings/tokens with access to the Matxa endpoint.");
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });
let failed = 0;
for (const text of missing) {
  const name = wanted.get(text);
  try {
    // One at a time. A scale-to-zero endpoint answers the first call slowly and
    // rejects a burst; thirty-six sentences is not worth a queue for.
    const audio = await synthesise(text);
    await fs.writeFile(path.join(OUT_DIR, name), audio);
    manifest.files[text] = name;
    console.log(`  ✓ ${name}  ${text}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${text}\n    ${error.message}`);
  }
}

// Written even after a partial failure: what did render should still be used.
await fs.writeFile(MANIFEST, JSON.stringify({ ...manifest, generated: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
const orphans = (await fs.readdir(OUT_DIR)).filter((name) => name.endsWith(".wav") && !Object.values(manifest.files).includes(name));
await Promise.all(orphans.map((name) => fs.unlink(path.join(OUT_DIR, name))));
if (orphans.length) console.log(`removed ${orphans.length} recording(s) of copy that has since changed`);

console.log(failed ? `\n${failed} sentence(s) failed. Re-run to retry only those.` : "\nDone.");
process.exit(failed ? 1 : 0);
