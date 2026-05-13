const CACHE = "metronomo-live-v73";
const ASSETS = [
  "./",
  "./index.html",
  "./assets/cbc-mark.png",
  "./supabase-config.js",
  "./styles.css",
  "./styles.css?v=2",
  "./styles.css?v=3",
  "./styles.css?v=4",
  "./styles.css?v=5",
  "./styles.css?v=6",
  "./styles.css?v=7",
  "./styles.css?v=8",
  "./styles.css?v=9",
  "./styles.css?v=10",
  "./styles.css?v=11",
  "./styles.css?v=12",
  "./styles.css?v=13",
  "./styles.css?v=14",
  "./styles.css?v=15",
  "./styles.css?v=16",
  "./styles.css?v=17",
  "./styles.css?v=18",
  "./styles.css?v=19",
  "./styles.css?v=20",
  "./styles.css?v=21",
  "./styles.css?v=22",
  "./styles.css?v=23",
  "./styles.css?v=24",
  "./styles.css?v=25",
  "./styles.css?v=26",
  "./styles.css?v=27",
  "./styles.css?v=28",
  "./styles.css?v=29",
  "./styles.css?v=30",
  "./styles.css?v=31",
  "./styles.css?v=32",
  "./styles.css?v=33",
  "./styles.css?v=34",
  "./styles.css?v=35",
  "./styles.css?v=36",
  "./styles.css?v=37",
  "./styles.css?v=38",
  "./styles.css?v=39",
  "./styles.css?v=40",
  "./styles.css?v=41",
  "./styles.css?v=42",
  "./styles.css?v=43",
  "./styles.css?v=44",
  "./styles.css?v=45",
  "./styles.css?v=46",
  "./styles.css?v=47",
  "./styles.css?v=48",
  "./styles.css?v=49",
  "./styles.css?v=50",
  "./styles.css?v=51",
  "./styles.css?v=52",
  "./styles.css?v=53",
  "./styles.css?v=54",
  "./styles.css?v=55",
  "./styles.css?v=56",
  "./styles.css?v=57",
  "./app.js",
  "./app.js?v=2",
  "./app.js?v=3",
  "./app.js?v=4",
  "./app.js?v=5",
  "./app.js?v=6",
  "./app.js?v=7",
  "./app.js?v=8",
  "./app.js?v=9",
  "./app.js?v=10",
  "./app.js?v=11",
  "./app.js?v=12",
  "./app.js?v=13",
  "./app.js?v=14",
  "./app.js?v=15",
  "./app.js?v=16",
  "./app.js?v=17",
  "./app.js?v=18",
  "./app.js?v=19",
  "./app.js?v=20",
  "./app.js?v=21",
  "./app.js?v=22",
  "./app.js?v=23",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
