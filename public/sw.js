/**
 * The Coach's service worker.
 *
 * Two jobs, and a long list of things it deliberately does not do.
 *
 * It makes the app installable, which is the whole point: an icon on a home
 * screen is the difference between a site someone visited once and an app they
 * open at breakfast. And it keeps the shell working without a connection —
 * a supermarket basement is exactly where a shopping basket is needed and
 * exactly where the signal goes.
 *
 * It never caches `/api/*`. The plan, the account and the event stream are all
 * live data; a stale target is worse than no target. And it never caches a
 * response it did not receive cleanly, so a captive-portal login page cannot be
 * baked in as the homepage.
 */

const VERSION = "v2";
const SHELL = `coach-shell-${VERSION}`;
const ASSETS = `coach-assets-${VERSION}`;

// Enough to boot and render the last plan from localStorage with no network.
const SHELL_URLS = ["/", "/coach.css", "/coach.js", "/voice.js", "/voice-commands.js", "/manifest.webmanifest", "/assets/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One missing file must not fail the whole install, so they are added
    // individually rather than with addAll.
    await Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS]);
    await Promise.all((await caches.keys()).map((key) => (keep.has(key) ? null : caches.delete(key))));
    await self.clients.claim();
  })());
});

const isAsset = (url) => /\.(?:css|js|png|jpe?g|svg|webp|woff2?)$/i.test(url.pathname);

/** The code, as opposed to the pictures and fonts it draws with. */
const isOwnCode = (url) => /\.(?:css|js)$/i.test(url.pathname);

/** Fresh when there is a network, last-known-good when there is not. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await cache.match("/");
    if (cached) return cached;
    throw error;
  }
}

/** Instant from disk, refreshed quietly in the background for next time. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && (response.type === "basic" || response.type === "cors")) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Live data, always. Never served from a cache, never written to one.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }

  /* The app's own script and stylesheet are network-first, not
     stale-while-revalidate. Stale-while-revalidate answers from disk even when
     there is a network, so a deploy only reached someone on their *second*
     load — the first one re-served the old file and merely refreshed the cache
     behind it. A bug fix that needs two reloads to arrive reads as a bug fix
     that never shipped. Offline is unaffected: networkFirst still falls back to
     the cached copy, which is what the supermarket basement needs. */
  if (url.origin === self.location.origin && isAsset(url)) {
    event.respondWith(isOwnCode(url) ? networkFirst(request, SHELL) : staleWhileRevalidate(request, SHELL));
    return;
  }

  /* The Coach's own Catalan voice: fixed sentences rendered ahead of time, and
     the manifest that names them. Both are immutable — a sentence that changes
     gets a new filename — so disk first, and they stay available offline, which
     is where the direct voice commands are most useful. */
  if (url.origin === self.location.origin && url.pathname.startsWith("/audio/")) {
    event.respondWith(staleWhileRevalidate(request, ASSETS));
    return;
  }

  // Generated meal photography, which is immutable once produced and is the
  // heaviest thing on the page.
  if (/(^|\.)fal\.media$/.test(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, ASSETS));
  }
});

/**
 * The evening nudge. The page asks for it while it is open; the worker is what
 * is still alive to show it once the tab is gone.
 */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "reminder" || !data.title) return;
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body || "",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    tag: "coach-daily-reminder",
    renotify: false,
    data: { url: data.url || "/#today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/#today";
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = clients.find((client) => client.url.includes(self.location.origin));
    if (open) return open.focus();
    return self.clients.openWindow(target);
  })());
});
