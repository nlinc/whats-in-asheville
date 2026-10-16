// Cache only this release's public app shell. Never intercept Firebase/auth/photo requests.
const CACHE_PREFIX = "whats-where-shell-";
const CACHE_NAME = `${CACHE_PREFIX}20261016-pwa2`;
const ASSETS = [
  "./index.html",
  "./styles.css?v=20261016-pwa2",
  "./app.js?v=20261016-pwa2",
  "./firebase-client.js?v=20261016-pwa2",
  "./firebase-config.js",
  "./pwa.js?v=20261016-pwa2",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
const shellURLs = new Set(ASSETS.map((asset) => new URL(asset, self.registration.scope).href));
const indexURL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  // Let updates wait until all old app windows close; never reload an open form.
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const appNavigation = request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html");
  if (!appNavigation && !shellURLs.has(url.href)) return;
  // Serve one coherent release, including on cold offline starts. The browser
  // checks sw.js for updates independently when opening the app.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(appNavigation ? indexURL : request);
    return cached || fetch(request);
  })());
});
