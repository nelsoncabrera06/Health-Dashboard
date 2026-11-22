// Validación de query params para las rutas /api/v1 de lectura.
//
// Las fechas se validan ANTES de llegar a lib/api/data.js: esas funciones tiran
// Error en una fecha inválida y `withApi` lo convertiría en un 500, cuando en
// realidad es un 400 del cliente.
import { addDays, dateInTz, isDate } from "./data";

const DATE_HINT = "Usá fechas en formato YYYY-MM-DD (ej. 2026-11-21).";

function fail(code, message) {
  return { ok: false, status: 400, code, message };
}

// `date` vacío = hoy en la zona del usuario.
export function readDay(value, timezone) {
  if (value && !isDate(value)) return fail("invalid_date", DATE_HINT);
  return { ok: true, date: value || dateInTz(timezone) };
}

// Rango de días locales inclusive. Sin `from`/`to` devuelve los últimos
// `defaultDays` días (contando hoy).
export function readRange(params, { timezone, defaultDays }) {
  const today = dateInTz(timezone);
  const to = params.get("to") || today;
  const from =
    params.get("from") || (defaultDays ? addDays(to, 1 - defaultDays) : today);
  if (!isDate(from) || !isDate(to)) return fail("invalid_date", DATE_HINT);
  if (from > to)
    return fail("invalid_range", "'from' no puede ser posterior a 'to'.");
  return { ok: true, from, to, timezone };
}

export function readLimit(params, { def = 200, max = 500 } = {}) {
  const raw = params.get("limit");
  if (raw === null) return { ok: true, limit: def };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max)
    return fail("invalid_limit", `'limit' tiene que ser un entero entre 1 y ${max}.`);
  return { ok: true, limit: n };
}
