// Catálogo de modelos que se pueden elegir desde /admin.
//
// Es la única fuente de verdad: el panel solo puede guardar lo que está acá, así
// no puede dejar el chat apuntando a un modelo inexistente, sin API key o sin
// visión. Para sumar uno alcanza con una entrada (y redeploy, es una lista).
//
// `price` es USD por 1M de tokens (null = gratis). `vision` indica si acepta
// fotos: los modelos sin visión siguen funcionando para texto y el chat devuelve
// un 400 legible cuando llega una foto.
//
// Verificado el 23-nov-2026 contra las APIs de Gemini y OpenRouter.

export const PROVIDER_LABELS = {
  gemini: "Gemini (Google)",
  openrouter: "OpenRouter",
};

export const MODELS = [
  {
    provider: "gemini",
    model: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    vision: true,
    price: null,
    note: "Es preview: cuando hay mucha demanda devuelve 503 (el error que viste).",
  },
  {
    provider: "gemini",
    model: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    vision: true,
    price: null,
  },
  {
    provider: "gemini",
    model: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    vision: true,
    price: null,
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3.5-super-vl:free",
    label: "Nemotron 3.5 Super VL",
    vision: true,
    price: null,
  },
  {
    provider: "openrouter",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B",
    vision: false,
    price: null,
    note: "Es el que estaba en .env. No acepta fotos.",
  },
  {
    provider: "openrouter",
    model: "deepseek/deepseek-v4.1-flash-1017",
    label: "DeepSeek 4.1 Flash 1017",
    vision: true,
    price: { input: 0.03, output: 0.2 },
  },
  {
    provider: "openrouter",
    model: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek 4.1 Flash",
    vision: true,
    price: { input: 0.3, output: 1.2 },
  },
];

export function findModel(provider, model) {
  const p = String(provider || "").toLowerCase();
  const m = String(model || "");
  return MODELS.find((x) => x.provider === p && x.model === m) || null;
}

export function providerLabel(provider) {
  return PROVIDER_LABELS[provider] || provider;
}
