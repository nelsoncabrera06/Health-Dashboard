// Validación de los cuerpos de escritura de la API (/api/v1/meals, /weights,
// /workouts).
//
// Los agentes son clientes automáticos: pueden mandar basura, reintentar o
// inventar campos. Todo se valida acá, antes de tocar la base, y el error sale
// como 400 con un código estable (`invalid_body`, `invalid_name`, ...) en vez de
// un 500 de Postgres.
import { isDate } from "./data";

const MAX_AHEAD_MS = 24 * 60 * 60 * 1000; // 1 día en el futuro
const MAX_BEHIND_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 años atrás

export function fail(code, message) {
  return { ok: false, status: 400, code, message };
}

// Lee y parsea el JSON del request una sola vez.
export async function readBody(req) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return fail("invalid_body", "El cuerpo tiene que ser un objeto JSON.");
    return { ok: true, body };
  } catch {
    return fail("invalid_body", "Cuerpo inválido: se esperaba JSON.");
  }
}

// Número acotado. `min`/`max` son obligatorios a propósito: sin techo, un agente
// puede escribir 10^9 kcal y romper todas las escalas del dashboard.
export function num(value, { field, min = 0, max, required = true, def = 0 }) {
  if (value === undefined || value === null || value === "") {
    if (!required) return { ok: true, value: def };
    return fail(`invalid_${field}`, `Falta "${field}".`);
  }
  const n = Number(value);
  if (!Number.isFinite(n))
    return fail(`invalid_${field}`, `"${field}" tiene que ser un número.`);
  if (n < min)
    return fail(`invalid_${field}`, `"${field}" no puede ser menor que ${min}.`);
  if (max !== undefined && n > max)
    return fail(`invalid_${field}`, `"${field}" no puede ser mayor que ${max}.`);
  return { ok: true, value: n };
}

export function text(value, { field, min = 1, max = 120, required = true, def = "" }) {
  if (value === undefined || value === null) {
    if (!required) return { ok: true, value: def };
    return fail(`invalid_${field}`, `Falta "${field}".`);
  }
  if (typeof value !== "string")
    return fail(`invalid_${field}`, `"${field}" tiene que ser texto.`);
  const s = value.trim();
  if (s.length < min)
    return fail(`invalid_${field}`, `"${field}" no puede estar vacío.`);
  if (s.length > max)
    return fail(`invalid_${field}`, `"${field}" no puede pasar de ${max} caracteres.`);
  return { ok: true, value: s };
}

// Timestamp ISO. Rechaza fechas muy viejas y más de un día en el futuro (un
// agente con el reloj mal no puede ensuciar el día de mañana).
export function timestamp(value, { field, required = false, def = null }) {
  if (value === undefined || value === null || value === "") {
    if (!required) return { ok: true, value: def };
    return fail(`invalid_${field}`, `Falta "${field}".`);
  }
  if (typeof value !== "string")
    return fail(`invalid_${field}`, `"${field}" tiene que ser una fecha ISO.`);
  const t = new Date(value);
  if (Number.isNaN(t.getTime()))
    return fail(
      `invalid_${field}`,
      `"${field}" no es una fecha válida. Usá ISO 8601 (2026-11-21T13:30:00-03:00).`
    );
  const now = Date.now();
  if (t.getTime() > now + MAX_AHEAD_MS)
    return fail(`invalid_${field}`, `"${field}" no puede estar más de 1 día en el futuro.`);
  if (t.getTime() < now - MAX_BEHIND_MS)
    return fail(`invalid_${field}`, `"${field}" es demasiado antiguo.`);
  return { ok: true, value: t.toISOString() };
}

// Fecha sin hora (pesos): un registro por día.
export function dateOnly(value, { field, required = false }) {
  if (value === undefined || value === null || value === "") {
    if (!required) return { ok: true, value: null };
    return fail(`invalid_${field}`, `Falta "${field}".`);
  }
  if (!isDate(value))
    return fail(`invalid_${field}`, `"${field}" tiene que ser YYYY-MM-DD.`);
  return { ok: true, value };
}

// Referencia de idempotencia: el agente reintenta y no queremos la comida dos veces.
export function clientRef(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string")
    return fail("invalid_client_ref", '"client_ref" tiene que ser texto.');
  const s = value.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > 64)
    return fail("invalid_client_ref", '"client_ref" no puede pasar de 64 caracteres.');
  return { ok: true, value: s };
}

// Corre una lista de validaciones y devuelve el primer error o los valores.
export function collect(entries) {
  const out = {};
  for (const [key, res] of Object.entries(entries)) {
    if (!res.ok) return res;
    out[key] = res.value;
  }
  return { ok: true, values: out };
}
