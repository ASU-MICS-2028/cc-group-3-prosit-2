/* HealthConnect service worker: lets the app open with no signal.
 * - On install it saves the app's own files (found by reading index.html) so the next start needs no network.
 * - Pages: network first, falling back to the saved index.html when offline.
 * - Other files from this site: saved copy first, then network (file names carry a hash, so a new release has new names).
 * Patient data never goes through here: it lives in the encrypted database on the phone.
 * Change VERSION when this file's behaviour changes, so old copies are cleared. */
const VERSION = "hc-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const res = await fetch("/index.html", { cache: "reload" });
    if (!res.ok) throw new Error("index.html unavailable");
    const html = await res.clone().text();
    const urls = new Set(["/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/fonts/EBGaramond-subset.woff2", "/fonts/Overpass-subset.woff2"]);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) urls.add(m[1]);
    await cache.put("/index.html", res);
    await cache.addAll([...urls].filter((u) => u !== "/index.html"));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch { return (await caches.match("/index.html")) || Response.error(); }
    })());
    return;
  }

  event.respondWith((async () => {
    const saved = await caches.match(req);
    if (saved) return saved;
    const res = await fetch(req);
    if (res.ok && res.type === "basic") (await caches.open(RUNTIME)).put(req, res.clone());
    return res;
  })());
});
