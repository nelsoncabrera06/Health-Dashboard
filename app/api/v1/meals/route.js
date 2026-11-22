// GET /api/v1/meals?from&to&limit — comidas del rango (default: últimos 7 días).
// POST /api/v1/meals — registra una comida (scope meals:write).
//
// POST es idempotente por `client_ref`: si el agente reintenta con la misma
// referencia, devuelve la comida que ya existe (200, `duplicated: true`) en vez
// de duplicarla. Una comida nueva responde 201.
import {
  addMeal,
  dateInTz,
  getDaySummary,
  getProfileData,
  listMeals,
} from "../../../../lib/api/data";
import { apiError, apiJson, withApi } from "../../../../lib/api/log";
import { parseMeal } from "../../../../lib/api/payloads";
import { readLimit, readRange } from "../../../../lib/api/query";
import { readBody } from "../../../../lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "list_meals", scope: "health:read" }, async (auth) => {
    const params = new URL(req.url).searchParams;
    const profile = await getProfileData(auth.userId);

    const range = readRange(params, { timezone: profile.timezone, defaultDays: 7 });
    if (!range.ok) return apiError(range.status, range.code, range.message);

    const limit = readLimit(params, { def: 200, max: 500 });
    if (!limit.ok) return apiError(limit.status, limit.code, limit.message);

    const result = await listMeals(auth.userId, {
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      limit: limit.limit,
    });

    return apiJson(result.meals, {
      timezone: result.timezone,
      from: result.from,
      to: result.to,
      count: result.meals.length,
      limit: limit.limit,
    });
  });
}

export async function POST(req) {
  return withApi(req, { tool: "add_meal", scope: "meals:write" }, async (auth) => {
    const parsed = await readBody(req);
    if (!parsed.ok) return apiError(parsed.status, parsed.code, parsed.message);

    const checked = parseMeal(parsed.body);
    if (!checked.ok) return apiError(checked.status, checked.code, checked.message);

    const { meal, duplicated } = await addMeal(auth.userId, checked.values);

    // El resumen se calcula para el día local al que cayó la comida, no para hoy:
    // un agente puede registrar la cena de ayer.
    const profile = await getProfileData(auth.userId);
    const date = dateInTz(profile.timezone, new Date(meal.eaten_at));
    const day = await getDaySummary(auth.userId, date);

    return apiJson(
      { meal, duplicated, day },
      { timezone: profile.timezone, date },
      { status: duplicated ? 200 : 201 }
    );
  });
}
