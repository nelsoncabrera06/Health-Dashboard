// Capa de providers AI (solo servidor).
// El route arma {system, messages} una vez y cada provider devuelve texto
// plano; el parseo de ESTIMACIÓN, el rate limit y Registrar/Descartar no cambian.
// Sumar un provider = una función + una entrada en PROVIDERS.
// Se elige con AI_PROVIDER=openrouter|gemini (.env local, env vars en Vercel).

const TIMEOUT_MS = 30000;

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function timedOut(e) {
  return e?.name === "TimeoutError" || e?.name === "AbortError";
}

async function openrouterComplete({ system, messages }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw fail(500, "Falta OPENROUTER_API_KEY en el servidor (.env).");
  if (!model) throw fail(500, "Falta OPENROUTER_MODEL en el servidor (.env).");
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
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({
            role: m.role,
            content: m.content.slice(0, 4000),
          })),
        ],
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

async function geminiComplete({ system, messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey) throw fail(500, "Falta GEMINI_API_KEY en el servidor (.env).");
  if (!model) throw fail(500, "Falta GEMINI_MODEL en el servidor (.env).");
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
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content.slice(0, 4000) }],
          })),
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

export function getProviderName() {
  return (process.env.AI_PROVIDER || "openrouter").trim().toLowerCase();
}

export function listProviders() {
  return Object.keys(PROVIDERS);
}

export async function complete({ system, messages }) {
  const name = getProviderName();
  const fn = PROVIDERS[name];
  if (!fn) {
    throw fail(
      500,
      `AI_PROVIDER desconocido ("${name}"). Valores: ${listProviders().join(", ")}.`
    );
  }
  return await fn({ system, messages });
}
