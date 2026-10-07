// Vercel serverless: baxolarni saqlaydi.
// kvdb.io kaliti faqat SERVERDA (KVDB_URL env) — clientda hech qanday token yo'q.
// GET  -> ro'yxatni qaytaradi
// POST -> baho qo'shadi (validatsiya + spam limit) va Telegramga mirorlaydi

const KVDB_URL = process.env.KVDB_URL || "https://kvdb.io/NdQiUbhBqJfHqNCqu85oFD/ratings";
const TG_URL = process.env.TELEGRAM_BOT_API_URL || ""; // ixtiyoriy: full sendMessage URL
const LIMIT_MS = 10 * 60 * 1000;
const LIMIT_COUNT = 10;
const MAX_LIST = 500;

function ipOf(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string" && f) return f.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

async function readRatings() {
  try {
    const r = await fetch(KVDB_URL, { cache: "no-store" });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

async function writeRatings(list) {
  const r = await fetch(KVDB_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(list),
  });
  if (!r.ok) throw new Error("kvdb " + r.status);
}

async function mirrorTelegram(rec) {
  if (!TG_URL) return;
  try {
    const msg =
      "⭐ Yangi baho: " + rec.s + "/5\n" +
      (rec.c ? "💬 " + rec.c + "\n" : "") +
      "🌐 " + (rec.lang || "uz") + " · " + new Date(rec.t).toISOString();
    await fetch(TG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg }),
    });
  } catch (e) {}
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const ratings = await readRatings();
    return res.status(200).json({ ok: true, ratings: ratings });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  body = body || {};

  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ ok: false, error: "stars 1-5 bo'lishi kerak" });
  }
  const comment = String(body.comment || "").slice(0, 400).trim();
  const lang = ["uz", "en", "ru"].includes(String(body.lang)) ? String(body.lang) : "uz";

  // Spam limit: IP bo'yicha 10 daqiqada 10 ta
  const ip = ipOf(req);
  const store = (globalThis.__rateLimit = globalThis.__rateLimit || {});
  const now = Date.now();
  const bucket = (store[ip] || []).filter((t) => now - t < LIMIT_MS);
  if (bucket.length >= LIMIT_COUNT) {
    return res.status(429).json({ ok: false, error: "limit" });
  }
  bucket.push(now);
  store[ip] = bucket;

  const rec = { s: stars, c: comment, t: now, lang: lang };

  let list = await readRatings();
  list = list.concat([rec]);
  if (list.length > MAX_LIST) list = list.slice(list.length - MAX_LIST);

  try {
    await writeRatings(list);
  } catch (e) {
    return res.status(502).json({ ok: false, error: "save failed" });
  }

  await mirrorTelegram(rec);
  return res.status(200).json({ ok: true, rating: rec });
};
