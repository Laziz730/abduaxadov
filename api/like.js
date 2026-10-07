// Vercel serverless: loyiha layklari (❤ heart).
// GET  -> barcha layklar {ok, likes:{repo:count}}
// POST -> bittaga +1 (repo validatsiya + IP spam limit)
// kvdb.io kaliti faqat SERVERDA (KVDB_LIKE_URL env).

const KVDB_URL =
  process.env.KVDB_LIKE_URL ||
  "https://kvdb.io/NdQiUbhBqJfHqNCqu85oFD/likes";
const LIMIT_MS = 10 * 60 * 1000;
const LIMIT_COUNT = 10;
const REPO_RE = /^[A-Za-z0-9_.-]{1,40}$/;

function ipOf(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string" && f) return f.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

async function readLikes() {
  try {
    const r = await fetch(KVDB_URL, { cache: "no-store" });
    if (!r.ok) return {};
    const d = await r.json();
    return d && typeof d === "object" && !Array.isArray(d) ? d : {};
  } catch (e) {
    return {};
  }
}

async function writeLikes(obj) {
  const r = await fetch(KVDB_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  if (!r.ok) throw new Error("kvdb " + r.status);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const likes = await readLikes();
    return res.status(200).json({ ok: true, likes: likes });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  body = body || {};

  const repo = String(body.repo || "");
  if (!REPO_RE.test(repo)) {
    return res.status(400).json({ ok: false, error: "bad repo" });
  }

  const ip = ipOf(req);
  const store = (globalThis.__likeLimit = globalThis.__likeLimit || {});
  const now = Date.now();
  const bucket = (store[ip] || []).filter((t) => now - t < LIMIT_MS);
  if (bucket.length >= LIMIT_COUNT) {
    return res.status(429).json({ ok: false, error: "limit" });
  }
  bucket.push(now);
  store[ip] = bucket;

  const likes = await readLikes();
  likes[repo] = (Number(likes[repo]) || 0) + 1;

  try {
    await writeLikes(likes);
  } catch (e) {
    return res.status(502).json({ ok: false, error: "save failed" });
  }

  return res.status(200).json({ ok: true, likes: likes });
};
