// GET /api/v1/summary?date=YYYY-MM-DD — resumen del día (comidas, ejercicios,
// totales, targets y restante). Sin `date` = hoy en la zona del usuario.
// Scope: health:read.
import { getDaySummary, getProfileData } from "../../../../lib/api/data";
import { apiError, apiJson, withApi } from "../../../../lib/api/log";
import { readDay } from "../../../../lib/api/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "get_day_summary", scope: "health:read" }, async (auth) => {
    const params = new URL(req.url).searchParams;
    const profile = await getProfileData(auth.userId);

    const day = readDay(params.get("date"), profile.timezone);
    if (!day.ok) return apiError(day.status, day.code, day.message);

    const summary = await getDaySummary(auth.userId, day.date);
    return apiJson(summary, {
      timezone: summary.timezone,
      date: summary.date,
    });
  });
}
