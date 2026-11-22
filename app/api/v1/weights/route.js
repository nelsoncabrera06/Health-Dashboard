// GET  /api/v1/weights?from&to — pesajes del rango (default: últimos 30 días).
// POST /api/v1/weights — registra el peso del día (scope weights:write).
//
// `measured_at` es date-only (YYYY-MM-DD) y hay un registro por día: el POST es
// un upsert, así que repetirlo pisa el valor en vez de duplicar la fila
// (unique (user_id, measured_at), ver 001_users_and_health.sql:102).
import {
  dateInTz,
  getProfileData,
  listWeights,
  upsertWeight,
} from "../../../../lib/api/data";
import { apiError, apiJson, withApi } from "../../../../lib/api/log";
import { readRange } from "../../../../lib/api/query";
import { collect, dateOnly, num, readBody } from "../../../../lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "list_weights", scope: "health:read" }, async (auth) => {
    const params = new URL(req.url).searchParams;
    const profile = await getProfileData(auth.userId);

    const range = readRange(params, { timezone: profile.timezone, defaultDays: 30 });
    if (!range.ok) return apiError(range.status, range.code, range.message);

    const result = await listWeights(auth.userId, {
      from: range.from,
      to: range.to,
    });

    return apiJson(result.weights, {
      timezone: range.timezone,
      from: result.from,
      to: result.to,
      count: result.weights.length,
    });
  });
}

export async function POST(req) {
  return withApi(req, { tool: "log_weight", scope: "weights:write" }, async (auth) => {
    const parsed = await readBody(req);
    if (!parsed.ok) return apiError(parsed.status, parsed.code, parsed.message);
    const body = parsed.body;

    const checked = collect({
      weightKg: num(body.weight_kg, { field: "weight_kg", min: 20, max: 400 }),
      measuredAt: dateOnly(body.measured_at, { field: "measured_at" }),
    });
    if (!checked.ok) return apiError(checked.status, checked.code, checked.message);

    // Sin fecha, el "hoy" es el del usuario, no el del servidor (Vercel corre en UTC).
    const profile = await getProfileData(auth.userId);
    const measuredAt = checked.values.measuredAt || dateInTz(profile.timezone);

    const weight = await upsertWeight(auth.userId, {
      weightKg: checked.values.weightKg,
      measuredAt,
    });

    return apiJson({ weight }, { timezone: profile.timezone, date: measuredAt });
  });
}
