// Capa de providers AI (solo servidor).
// El route arma {system, messages, image} una vez; el provider y el modelo salen
// de `getAiConfig()` (panel /admin con fallback a env, ver lib/settings.js) y cada
// provider devuelve texto plano. El parseo de ESTIMACIÓN, el rate limit y
// Registrar/Descartar no cambian.
// `image` es una data URL (o null). Gemini tiene visión en todos sus modelos;
// en OpenRouter depende del modelo (lo sabe `lib/aiCatalog.js`), así que una foto
// a un modelo sin visión devuelve un 400 legible en vez de romper contra el
// upstream.
// Las notas de voz NO llegan acá: el route las transcribe con `lib/stt.js` y
// manda texto, así la voz funciona con cualquier modelo.
// Sumar un provider = una función + una entrada en PROVIDERS + modelos en el catálogo.
// Se elige con el panel /admin o, por default, con AI_PROVIDER=openrouter|gemini (.env).

import { getAiConfig } from "./settings";
import { findModel } from "./aiCatalog";

const TIMEOUT_MS = 30000;

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function timedOut(e) {
  return e?.name === "TimeoutError" || e?.name === "AbortError";
}

async function openrouterComplete({ system, messages, image, model, vision }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw fail(500, "Falta OPENROUTER_API_KEY en el servidor (.env).");
  if (!model) throw fail(500, "Falta el modelo de OpenRouter (panel /admin o env).");
  // Un modelo de texto rechaza la foto con un 400 críptico del upstream: mejor
  // un mensaje claro y elegir otro modelo desde /admin.
  if (image && !vision)
    throw fail(
      400,
      "Este modelo no acepta fotos. Elegí uno con visión desde Admin."
    );

  const payload = messages.map((m) => ({
    role: m.role,
    content: m.content.slice(0, 4000),
  }));
  if (image) {
    // La foto va adjunta al último mensaje del usuario, igual que en Gemini.
    let idx = payload.length - 1;
    while (idx >= 0 && payload[idx].role !== "user") idx--;
    if (idx < 0) idx = payload.length - 1;
    payload[idx] = {
      role: "user",
      content: [
        { type: "text", text: payload[idx].content },
        { type: "image_url", image_url: { url: image } },
      ],
    };
  }

  let r;
  try {
    r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      // Sin timeout, un upstream colgado deja la request abierta para siempre.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3100",
        "X-Title": "Health Dashboard",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, ...payload],
      }),
    });
  } catch (e) {
    throw fail(
      502,
      timedOut(e)
        ? "El modelo tardó demasiado. Probá de nuevo."
        : "No se pudo contactar al modelo."
    );
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw fail(502, `El modelo respondió ${r.status}. ${text.slice(0, 200)}`);
  }
  const out = await r.json();
  return out?.choices?.[0]?.message?.content || "";
}

async function geminiComplete({ system, messages, image, model }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw fail(500, "Falta GEMINI_API_KEY en el servidor (.env).");
  if (!model) throw fail(500, "Falta el modelo de Gemini (panel /admin o env).");
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.slice(0, 4000) }],
  }));
  // Visión (paso 11): la foto se adjunta al último mensaje del usuario como
  // inline_data. El cliente siempre comprime a JPEG (lib/chatPhoto.js).
  if (image) {
    const m = image.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) throw fail(400, "La foto llegó en un formato inválido.");
    if (m[2].length > 2_000_000)
      throw fail(400, "La foto es muy pesada. Probá con una más chica.");
    let idx = contents.length - 1;
    while (idx >= 0 && contents[idx].role !== "user") idx--;
    if (idx < 0) idx = contents.length - 1;
    contents[idx].parts.push({
      inline_data: { mime_type: m[1].toLowerCase(), data: m[2] },
    });
  }
  let r;
  try {
    r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
        }),
      }
    );
  } catch (e) {
    throw fail(
      502,
      timedOut(e)
        ? "El modelo tardó demasiado. Probá de nuevo."
        : "No se pudo contactar al modelo."
    );
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw fail(502, `El modelo respondió ${r.status}. ${text.slice(0, 200)}`);
  }
  const out = await r.json();
  const text = (out?.candidates?.[0]?.content?.parts || [])
    .map((p) => p?.text || "")
    .join("");
  if (!text) {
    const block = out?.promptFeedback?.blockReason;
    throw fail(
      502,
      block
        ? `El modelo bloqueó la respuesta (${block}).`
        : "El modelo no devolvió texto."
    );
  }
  return text;
}

const PROVIDERS = {
  openrouter: openrouterComplete,
  gemini: geminiComplete,
};

export function listProviders() {
  return Object.keys(PROVIDERS);
}

export async function complete({ system, messages, image }) {
  const cfg = await getAiConfig();
  const fn = PROVIDERS[cfg.provider];
  if (!fn) {
    throw fail(
      500,
      `Provider de AI desconocido ("${cfg.provider}"). Valores: ${listProviders().join(", ")}.`
    );
  }
  if (!cfg.model) {
    throw fail(
      500,
      `Falta el modelo de "${cfg.provider}". Elegilo en Admin o cargalo en el entorno.`
    );
  }
  // El catálogo marca qué modelos aceptan fotos. Un modelo cargado por env que
  // no esté en el catálogo se trata como texto (mismo comportamiento de antes).
  const entry = findModel(cfg.provider, cfg.model);
  return await fn({
    system,
    messages,
    image,
    model: cfg.model,
    vision: Boolean(entry?.vision),
  });
}
