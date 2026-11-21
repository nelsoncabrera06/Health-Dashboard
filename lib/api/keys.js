// Generación y hash de API keys para agentes.
//
// Formato: hd_live_<32 bytes base64url>. El token se muestra UNA sola vez al
// crearlo; en la DB solo vive su SHA-256 (tabla api_key_secrets).
// No usamos bcrypt: la key es aleatoria de 256 bits, no una password humana.
import crypto from "node:crypto";

export const KEY_PREFIX = "hd_live_";
export const KEY_DISPLAY_LEN = 12; // "hd_live_" (8) + 4 chars

// Scopes válidos. `health:read` es la base y se agrega siempre: sin lectura el
// agente no puede ni confirmar lo que escribió.
export const SCOPES = [
  {
    value: "health:read",
    label: "Leer",
    hint: "Perfil, resumen del día, comidas, pesos y ejercicios",
  },
  {
    value: "meals:write",
    label: "Registrar comidas",
    hint: "Agregar comidas (no borrar)",
  },
  {
    value: "weights:write",
    label: "Registrar peso",
    hint: "Agregar o corregir el peso del día",
  },
  {
    value: "workouts:write",
    label: "Registrar ejercicio",
    hint: "Agregar entrenamientos",
  },
];

export const SCOPE_VALUES = SCOPES.map((s) => s.value);
export const ALL_SCOPES = SCOPE_VALUES;

// Vencimiento elegible. El máximo es 1 año (la DB lo valida con un check).
export const EXPIRY_OPTIONS = [
  { value: "90d", days: 90, label: "90 días" },
  { value: "6m", days: 180, label: "6 meses" },
  { value: "1y", days: 365, label: "1 año" },
];

export function generateKey() {
  return KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
}

export function hashKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function keyPrefix(key) {
  return key.slice(0, KEY_DISPLAY_LEN);
}

export function isApiKey(token) {
  return typeof token === "string" && token.startsWith(KEY_PREFIX);
}

// Normaliza lo que manda el cliente: únicos, válidos y siempre con health:read.
export function normalizeScopes(input) {
  const list = Array.isArray(input) ? input : [];
  const valid = [...new Set(list)].filter((s) => SCOPE_VALUES.includes(s));
  if (!valid.includes("health:read")) valid.unshift("health:read");
  return valid;
}

// Devuelve la cantidad de días o null si el valor no es válido.
export function expiryDays(value) {
  const opt = EXPIRY_OPTIONS.find((o) => o.value === value);
  return opt ? opt.days : null;
}
