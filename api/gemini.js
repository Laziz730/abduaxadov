// Vercel serverless: Groq (llama) AI yordamchi.
// Key server tomonda saqlanadi (brauzerga ko'rinmaydi).
// Sozlash: Vercel -> Settings -> Environment Variables -> GROQ_API_KEY
//   qiymat sifatida Groq API kalitingizni kiriting (console.groq.com).
//   Agar env o'rnatilmagan bo'lsa, fallback quyidagi qiymat ishlatiladi.

let fallbackKey = process.env.GROQ_API_KEY || "";

async function callGroq(messages, key) {
  const model = "openai/gpt-oss-120b";
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const body = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 700,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) {
    const txt = await r.text().catch(function () { return ""; });
    throw new Error("Groq " + r.status + ": " + txt.slice(0, 300));
  }
  const data = await r.json();
  try {
    return data.choices[0].message.content;
  } catch (e) {
    throw new Error("Javobni pars qilib bo'lmadi");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); } catch (e) { body = {}; }
  const q = String(body.q || body.message || "").trim();
  if (!q) return res.status(400).json({ ok: false, error: "empty" });

  const key = process.env.GROQ_API_KEY || fallbackKey;
  if (!key) {
    return res.status(500).json({ ok: false, error: "GROQ_API_KEY not set" });
  }

  const langName = { uz: "o'zbekcha", en: "English", ru: "русском" }[String(body.lang || "uz")] || "o'zbekcha";

  const system =
    "Sen - Abdulaziz Abduahadovning shaxsiy portfolio saytining AI yordamchisisiz. " +
    "Abdulaziz - 11 yoshli Full-Stack dasturchi, Samarqand, Oqdaryo tumanidan. " +
    "Uning quyidagi bo'limlari bor va foydalanuvchi o'sha bo'limga o'tishni so'rasa, " +
    "javob oxiriga shu formatda maxsus markerni qo'shish kerak: [NAV:section_id]. " +
    "Mavjud bo'limlar: home (Bosh), about (Haqimda), skills (Mahorat), services (Xizmatlar), " +
    "projects (Loyihalar), certs (Sertifikatlar), timeline (Yo'l), contact (Aloqa). " +
    "Agar buyruq bo'limga o'tishni so'rasa (masalan 'sertifikatlar bo'limiga o't'), " +
    "javobga [NAV:certs] qo'sh. Oddiy savolga esa qisqa, do'stona javob ber. " +
    "Muhim: butun javobni faqat " + langName + " tilida yoz. Qisqa va tushunarli bo'l.";

  const messages = [
    { role: "user", content: system },
    { role: "user", content: "Vazifa: quyidagi savolga javob ber: " + q },
  ];

  try {
    const answer = await callGroq(messages, key);
    const navMatch = answer.match(/\[NAV:([a-zA-Z0-9_-]+)\]/);
    const clean = answer.replace(/\[NAV:[a-zA-Z0-9_-]+\]/g, "").trim();
    return res.json({ ok: true, answer: clean || answer, nav: navMatch ? navMatch[1] : null });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e) });
  }
};
