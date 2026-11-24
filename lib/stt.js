// Speech-to-text de las notas de voz del chat.
//
// Por qué un STT aparte y no el audio nativo del modelo: el chat puede estar
// apuntando a cualquier modelo (DeepSeek, Nemotron, Gemini...), y no todos
// aceptan audio. Transcribiendo antes, la voz funciona con el modelo que esté
// activo. Es el mismo esquema que usa Pepe/OpenClaw en Android: Groq + Whisper
// por el endpoint OpenAI-compatible `/audio/transcriptions`.
//
// Config: GROQ_API_KEY (obligatoria) y GROQ_STT_MODEL (opcional). El tier
// gratuito de Groq alcanza de sobra para notas de hasta 30s.

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const DEFAULT_MODEL = "whisper-large-v3-turbo";
const TIMEOUT_MS = 20000;
// 30s de opus pesan ~100KB; el tope es por las dudas (Groq acepta hasta 25MB).
const MAX_BYTES = 8_000_000;

// Mime → extensión del archivo que se manda en el multipart. Whisper necesita
// un nombre con extensión para deducir el formato.
const EXT = {
  webm: "webm",
  ogg: "ogg",
  mp4: "mp4",
  m4a: "m4a",
  wav: "wav",
  mpeg: "mp3",
  mp3: "mp3",
  flac: "flac",
  aac: "m4a",
};

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  e.code = "stt_failed";
  return e;
}

function timedOut(e) {
  return e?.name === "TimeoutError" || e?.name === "AbortError";
}

// data URL (audio/webm;base64,...) → { text, model }
// `language` fija el idioma: la app es en español y así Whisper no adivina.
export async function transcribe(dataUrl, { language = "es" } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey)
    throw fail(500, "Falta GROQ_API_KEY en el servidor: sin eso no se pueden entender las notas de voz.");

  // OJO: MediaRecorder entrega `audio/webm;codecs=opus`, así que el data URL
  // viene como `data:audio/webm;codecs=opus;base64,...`. Los parámetros van
  // antes de `;base64` y hay que tolerarlos.
  const m = /^data:(audio\/[a-z0-9.+-]+)(?:;[^;,]*)*;base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    String(dataUrl || "")
  );
  if (!m) throw fail(400, "El audio llegó en un formato inválido.");

  // Se ignora el parámetro `codecs`: el contenedor es lo que importa.
  const mime = m[1].toLowerCase();
  const bytes = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (!bytes.length) throw fail(400, "El audio llegó vacío.");
  if (bytes.length > MAX_BYTES) throw fail(400, "El audio es demasiado largo.");

  const subtype = mime.split("/")[1].split(";")[0];
  const ext = EXT[subtype] || "webm";
  const model = process.env.GROQ_STT_MODEL || DEFAULT_MODEL;

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), `nota.${ext}`);
  form.append("model", model);
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (language) form.append("language", language);

  let r;
  try {
    r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw fail(
      502,
      timedOut(e)
        ? "La transcripción tardó demasiado. Probá de nuevo."
        : "No se pudo contactar al servicio de voz."
    );
  }

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    if (r.status === 401 || r.status === 403)
      throw fail(500, "La API key del servicio de voz no es válida.");
    if (r.status === 429)
      throw fail(429, "El servicio de voz está saturado. Probá en un rato.");
    if (r.status === 413)
      throw fail(400, "El audio es demasiado largo. Probá con una nota más corta.");
    throw fail(502, `El servicio de voz respondió ${r.status}. ${detail.slice(0, 120)}`);
  }

  const out = await r.json().catch(() => null);
  const text = String(out?.text || "").trim();
  if (!text)
    throw fail(422, "No se entendió el audio. Grabá de nuevo más cerca del micrófono.");

  return { text, model };
}
