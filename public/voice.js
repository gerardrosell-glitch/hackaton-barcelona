/**
 * public/voice.js — the Coach, hands-free.
 *
 * Loaded on demand, the first time someone taps the microphone, because most
 * visits never ask for it and it has no business in the boot path.
 *
 * The loop is deliberately turn-taking rather than always-on. It listens until
 * the browser reports a finished sentence, stops the microphone, answers, and
 * only then listens again. Two reasons. A microphone that stays open while the
 * synthesiser is talking hears the Coach and answers itself, and a microphone
 * that stays open when nobody is speaking is a microphone nobody asked to leave
 * open. Three silent turns and it stops on its own.
 *
 * Every sentence is tried against the local grammar in `voice-commands.js`
 * first. "Open my basket" never touches the network, which is the difference
 * between a shopping list that works in a supermarket basement and one that
 * does not. Only what the grammar does not recognise is sent to `/api/voice`.
 *
 * Where the browser has no speech recognition — Firefox today, and iOS in some
 * configurations — the same panel opens with a text field instead of a
 * microphone. Everything downstream of the transcript is identical, so the
 * feature degrades to "type a command" rather than disappearing.
 */

import { APP_REPLIES, matchVoiceCommand, MAX_TRANSCRIPT_LENGTH, VOICE_EXAMPLES } from "./voice-commands.js";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const BCP47 = { en: "en-GB", ca: "ca-ES" };

/** Stop a hot microphone that nobody is talking into. */
const SILENT_TURNS_BEFORE_STOP = 3;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

const COPY = {
  en: {
    title: "Talk to your Coach",
    idle: "Tap the circle and speak.",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    close: "Close",
    stopSpeaking: "Stop",
    tapToTalk: "Tap to talk",
    tapToStop: "Tap to stop",
    examples: "Try saying",
    typeInstead: "Or type a command",
    send: "Send",
    unsupported: "This browser cannot listen yet. Type a command instead — everything else works the same.",
    denied: "Your browser is blocking the microphone. Allow it for this site, then tap the circle again.",
    noMic: "No microphone was found. Type a command instead.",
    networkVoice: "The speech service is unreachable. Type a command instead.",
    quiet: "I didn’t hear anything, so I stopped listening. Tap the circle when you’re ready.",
    notUnderstood: "I didn’t catch that. Try one of the examples below.",
    privacy: "Your browser turns speech into text. Only text the Coach doesn’t already understand is sent to be answered, and no audio is stored.",
  },
  ca: {
    title: "Parla amb el teu Coach",
    idle: "Toca el cercle i parla.",
    listening: "Escoltant…",
    thinking: "Pensant…",
    speaking: "Parlant…",
    close: "Tanca",
    stopSpeaking: "Atura",
    tapToTalk: "Toca per parlar",
    tapToStop: "Toca per aturar",
    examples: "Prova de dir",
    typeInstead: "O escriu una ordre",
    send: "Envia",
    unsupported: "Aquest navegador encara no pot escoltar. Escriu una ordre: la resta funciona igual.",
    denied: "El navegador bloqueja el micròfon. Autoritza’l per a aquest lloc i torna a tocar el cercle.",
    noMic: "No s’ha trobat cap micròfon. Escriu una ordre.",
    networkVoice: "El servei de veu no respon. Escriu una ordre.",
    quiet: "No he sentit res i he deixat d’escoltar. Toca el cercle quan vulguis.",
    notUnderstood: "No ho he entès. Prova un dels exemples.",
    privacy: "El navegador converteix la veu en text. Només s’envia el text que el Coach no entén pel seu compte, i no es desa cap àudio.",
  },
};

const PANEL_MARKUP = (copy, canListen) => `
  <div class="voice-sheet" role="dialog" aria-modal="true" aria-labelledby="voice-title">
    <div class="voice-head">
      <h2 id="voice-title">${esc(copy.title)}</h2>
      <button class="voice-close" type="button" data-voice-close>${esc(copy.close)}</button>
    </div>
    <div class="voice-stage">
      <button class="voice-orb" type="button" data-voice-orb aria-label="${esc(canListen ? copy.tapToTalk : copy.typeInstead)}">
        <span class="voice-orb-ring" aria-hidden="true"></span>
        <span class="voice-orb-ring voice-orb-ring--slow" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>
        </svg>
      </button>
      <p class="voice-state" data-voice-state>${esc(canListen ? copy.idle : copy.unsupported)}</p>
    </div>
    <div class="voice-transcript" data-voice-log aria-live="polite" aria-atomic="false"></div>
    <div class="voice-examples" data-voice-examples>
      <p class="voice-examples-label">${esc(copy.examples)}</p>
      <ul></ul>
    </div>
    <form class="voice-typed" data-voice-form>
      <label class="sr-only" for="voice-typed-input">${esc(copy.typeInstead)}</label>
      <input id="voice-typed-input" type="text" autocomplete="off" enterkeyhint="send" maxlength="${MAX_TRANSCRIPT_LENGTH}" placeholder="${esc(copy.typeInstead)}">
      <button class="button button--sm" type="submit">${esc(copy.send)}</button>
    </form>
    <p class="voice-privacy">${esc(copy.privacy)}</p>
  </div>`;

/**
 * @param {object} bridge  Everything the controller is allowed to touch in the
 *   app: `language()`, `context()`, `history()`, `perform(action)`,
 *   `remember(role, text)` and `track(name, props)`.
 */
export function createVoiceController(bridge) {
  const langCode = () => (bridge.language() === "ca" ? "ca" : "en");
  const copy = () => COPY[langCode()];
  const canListen = Boolean(SpeechRecognition);

  let panel = null;
  let recognition = null;
  let mode = "idle";           // idle | listening | thinking | speaking
  let handsFree = false;       // whether a finished turn should listen again
  let silentTurns = 0;
  let closing = false;

  /* iOS will not speak unless the first utterance follows a real tap, so the
     opening tap spends one silent utterance buying that permission. */
  function primeSpeech() {
    if (!window.speechSynthesis) return;
    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
    } catch {
      // A browser without synthesis still reads its answers on screen.
    }
  }

  /* ── Catalan, in a Catalan voice ─────────────────────────────────────────
     Most phones ship no Catalan voice at all, so `speechSynthesis` reads the
     Coach's Catalan in Spanish. The sentences that carry no live number are a
     fixed set, rendered ahead of time by Matxa — the Barcelona Supercomputing
     Center's Catalan synthesiser — and looked up here by their own text.

     Everything about this is optional. No manifest, a sentence that is not in
     it, a file that will not play: each falls through to the synthesiser, which
     is what English uses and what Catalan used before. */
  let recordings = null;
  let currentAudio = null;

  function catalanRecordings() {
    if (recordings) return recordings;
    recordings = fetch("/audio/ca/manifest.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((manifest) => manifest?.files || {})
      .catch(() => ({}));
    return recordings;
  }

  function playRecording(file) {
    return new Promise((resolve, reject) => {
      const audio = new Audio("/audio/ca/" + file);
      let settled = false;
      const finish = (error) => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
      audio.onended = () => { currentAudio = null; finish(); };
      audio.onerror = () => { currentAudio = null; finish(new Error("audio failed")); };
      currentAudio = audio;
      audio.play().catch(finish);
    });
  }

  function pickVoice(code) {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    const wanted = BCP47[code] || BCP47.en;
    return voices.find((voice) => voice.lang?.replace("_", "-") === wanted)
      || voices.find((voice) => voice.lang?.toLowerCase().startsWith(code))
      // Catalan is not installed on every device; Spanish reads it far closer
      // than English does, so it is the fallback rather than nothing.
      || (code === "ca" ? voices.find((voice) => voice.lang?.toLowerCase().startsWith("es")) : null)
      || null;
  }

  async function speak(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const code = langCode();
    if (code === "ca") {
      const file = (await catalanRecordings())[trimmed];
      if (file) {
        try {
          return await playRecording(file);
        } catch {
          // The recording is a nicety. Losing it must not lose the answer.
        }
      }
    }
    return synthesise(trimmed, code);
  }

  function synthesise(trimmed, code) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = BCP47[code] || BCP47.en;
      const voice = pickVoice(code);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      utterance.onend = finish;
      utterance.onerror = finish;
      // Some engines never fire `onend` on a cancelled utterance, and a promise
      // that never settles would leave the loop stuck in "speaking" for good.
      setTimeout(finish, Math.min(20000, 1800 + trimmed.length * 90));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  function setMode(next, message) {
    mode = next;
    if (!panel) return;
    panel.dataset.voiceMode = next;
    const state = panel.querySelector("[data-voice-state]");
    const orb = panel.querySelector("[data-voice-orb]");
    const label = { idle: copy().idle, listening: copy().listening, thinking: copy().thinking, speaking: copy().speaking }[next];
    if (state) state.textContent = message || label;
    if (orb) orb.setAttribute("aria-label", next === "listening" ? copy().tapToStop : copy().tapToTalk);
  }

  function log(role, text) {
    if (!panel || !String(text || "").trim()) return;
    const line = document.createElement("p");
    line.className = "voice-line voice-line--" + role;
    line.textContent = text;
    const container = panel.querySelector("[data-voice-log]");
    container.append(line);
    panel.querySelector("[data-voice-examples]").hidden = true;
    while (container.children.length > 8) container.firstElementChild.remove();
    container.scrollTop = container.scrollHeight;
  }

  function renderExamples() {
    if (!panel) return;
    const list = panel.querySelector("[data-voice-examples] ul");
    const label = panel.querySelector(".voice-examples-label");
    if (label) label.textContent = copy().examples;
    if (!list) return;
    list.innerHTML = (VOICE_EXAMPLES[bridge.language() === "ca" ? "ca" : "en"] || [])
      .map((example) => '<li><button type="button" data-voice-example="' + esc(example) + '">' + esc(example) + "</button></li>")
      .join("");
  }

  /** Runs the checked actions and collects anything the app wants read aloud. */
  async function runActions(actions) {
    const spoken = [];
    // An action that declines — "finish your setup first" — has to replace the
    // grammar's confirmation, not trail it. "Here's your basket. Let's finish
    // your setup first" is two answers to one sentence, and the first is false.
    let override = "";
    for (const action of actions) {
      if (action.name === "stop") { close(); return { spoken, override, stopped: true }; }
      try {
        const said = await bridge.perform(action);
        if (said && typeof said === "object") override = override || String(said.say || "");
        else if (said) spoken.push(said);
      } catch (error) {
        console.error("Voice action failed", action.name, error);
      }
      bridge.track("voice_action", { action: action.name });
    }
    return { spoken, override, stopped: false };
  }

  async function interpretRemotely(transcript) {
    const response = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        language: bridge.language(),
        context: bridge.context(),
        history: bridge.history(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "voice_failed");
    return data;
  }

  async function handle(transcript) {
    const said = String(transcript || "").trim().slice(0, MAX_TRANSCRIPT_LENGTH);
    if (!said) return;
    silentTurns = 0;
    log("user", said);
    bridge.remember("user", said);
    setMode("thinking");

    const local = matchVoiceCommand(said, bridge.language());
    let reply = local;
    if (!local) {
      if (!navigator.onLine) {
        reply = { actions: [], say: APP_REPLIES.offline[langCode()] };
      } else {
        try {
          const remote = await interpretRemotely(said);
          reply = { actions: remote.actions || [], say: remote.say || "" };
          bridge.track("voice_command", { source: "model" });
        } catch (error) {
          console.error("Voice interpretation failed", error);
          reply = { actions: [], say: APP_REPLIES.unreachable[langCode()] };
        }
      }
    } else {
      bridge.track("voice_command", { source: "local" });
    }

    const { spoken, override, stopped } = await runActions(reply.actions || []);
    if (stopped) return;
    const answer = override || [reply.say, ...spoken].filter(Boolean).join(" ");
    if (!answer) return listenAgain();
    log("coach", answer);
    bridge.remember("assistant", answer);
    setMode("speaking");
    await speak(answer);
    listenAgain();
  }

  function listenAgain() {
    if (closing || !panel) return;
    if (handsFree && canListen) return listen();
    setMode("idle");
  }

  function listen() {
    if (!canListen || closing) return;
    stopSpeaking();
    stopRecognition();

    recognition = new SpeechRecognition();
    recognition.lang = BCP47[bridge.language() === "ca" ? "ca" : "en"];
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim && mode === "listening") setMode("listening", interim.trim());
    };
    recognition.onerror = (event) => {
      handsFree = false;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") return setMode("idle", copy().denied);
      if (event.error === "audio-capture") return setMode("idle", copy().noMic);
      if (event.error === "network") return setMode("idle", copy().networkVoice);
      // "no-speech" and "aborted" are ordinary; onend deals with them.
    };
    recognition.onend = () => {
      recognition = null;
      if (closing || mode !== "listening") return;
      const heard = finalTranscript.trim();
      if (heard) return void handle(heard);
      silentTurns += 1;
      if (handsFree && silentTurns < SILENT_TURNS_BEFORE_STOP) return listen();
      handsFree = false;
      setMode("idle", copy().quiet);
    };

    try {
      recognition.start();
      setMode("listening");
    } catch {
      // start() throws when a previous session has not finished releasing the
      // microphone. One retry on the next tick is enough; two would loop.
      recognition = null;
      setTimeout(() => { if (mode !== "listening" && handsFree) listen(); }, 250);
    }
  }

  /** Silences whichever of the two is talking. */
  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  }

  function stopRecognition() {
    if (!recognition) return;
    const current = recognition;
    recognition = null;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try { current.abort(); } catch { /* already gone */ }
  }

  function toggleListening() {
    if (mode === "listening") {
      handsFree = false;
      stopRecognition();
      return setMode("idle");
    }
    if (mode === "speaking") stopSpeaking();
    if (!canListen) return panel?.querySelector("#voice-typed-input")?.focus();
    handsFree = true;
    silentTurns = 0;
    listen();
  }

  function close() {
    closing = true;
    handsFree = false;
    stopRecognition();
    stopSpeaking();
    panel?.remove();
    panel = null;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeydown);
    bridge.track("voice_closed");
  }

  function onKeydown(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
  }

  function open() {
    if (panel) return;
    closing = false;
    silentTurns = 0;
    panel = document.createElement("div");
    panel.className = "voice-panel";
    panel.id = "voice-panel";
    panel.innerHTML = PANEL_MARKUP(copy(), canListen);
    document.body.append(panel);
    document.body.classList.add("modal-open");
    renderExamples();
    setMode("idle", canListen ? copy().idle : copy().unsupported);

    panel.addEventListener("click", (event) => {
      if (event.target === panel || event.target.closest("[data-voice-close]")) return close();
      if (event.target.closest("[data-voice-orb]")) return toggleListening();
      const example = event.target.closest("[data-voice-example]");
      if (example) {
        handsFree = false;
        return void handle(example.dataset.voiceExample);
      }
    });
    panel.querySelector("[data-voice-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = panel.querySelector("#voice-typed-input");
      const typed = input.value.trim();
      input.value = "";
      if (typed) { handsFree = false; void handle(typed); }
    });
    document.addEventListener("keydown", onKeydown);

    primeSpeech();
    if (langCode() === "ca") void catalanRecordings();
    // Chrome fills the voice list asynchronously; without this the first
    // sentence of a session is read by the wrong-language default voice.
    if (window.speechSynthesis && !window.speechSynthesis.getVoices().length) {
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {}, { once: true });
    }
    bridge.track("voice_opened", { supported: canListen });
    if (canListen) toggleListening();
    else panel.querySelector("#voice-typed-input")?.focus();
  }

  return { open, close, isOpen: () => Boolean(panel), supported: canListen };
}
