/* 三分训练 PWA — Service Worker
   作用：缓存 App 外壳，让手机在断网/关掉电脑服务器后仍能打开；
   同时让 Chrome/Android 给出「安装到主屏幕」的提示。 */
const CACHE = "threePointTrainer-v5";
const ASSETS = [
  "./",
  "index.html",
  "app.js",
  "style.css",
  "manifest.json",
  "icon.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon.ico",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 只处理同源资源

  // 页面导航：网络优先，断网则回退到缓存首页（保证离线可开）
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // 静态资源：缓存优先，未命中再走网络并补缓存
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
