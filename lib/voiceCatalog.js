// Catálogo de providers de voz (speech-to-text).
//
// La voz no se elige desde /admin todavía: sale del entorno (`GROQ_*`). Este
// catálogo existe para mostrar en el panel qué provider y modelo están en uso y
// si la API key está cargada, y para que sumar otro provider sea una entrada acá
// más su rama en `voiceProviderHasKey` / `envVoiceConfig`.
//
// En `lib/stt.js` la transcripción usa el mismo `envVoiceConfig()`, así el panel
// y el chat no pueden mostrar/usar modelos distintos.

export const VOICE_PROVIDERS = [
  {
    provider: "groq",
    label: "Groq",
    note: "Whisper por el endpoint OpenAI-compatible. El tier gratuito alcanza para notas de hasta 30 s.",
    models: [
      {
        model: "whisper-large-v3-turbo",
        label: "Whisper Large v3 Turbo",
        note: "Más rápido. Es el default.",
      },
      {
        model: "whisper-large-v3",
        label: "Whisper Large v3",
        note: "Un poco más lento y algo más preciso.",
      },
    ],
  },
];

export const DEFAULT_VOICE_MODEL = "whisper-large-v3-turbo";

export function voiceProviderHasKey(provider) {
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  return false;
}

// Config activa. Hoy hay un solo provider (Groq) y el modelo se puede cambiar
// con `GROQ_STT_MODEL`; si no está, cae al default del catálogo.
export function envVoiceConfig() {
  const provider = "groq";
  const raw = (process.env.GROQ_STT_MODEL || "").trim();
  return {
    provider,
    model: raw || DEFAULT_VOICE_MODEL,
    source: "env",
  };
}

export function voiceModelLabel(provider, model) {
  const p = VOICE_PROVIDERS.find((x) => x.provider === provider);
  return p?.models?.find((m) => m.model === model)?.label || model || "";
}
