// GET  /api/v1/workouts?from&to — entrenamientos del rango (default: últimos 7 días).
// POST /api/v1/workouts — registra un entrenamiento (scope workouts:write).
import {
  addWorkout,
  dateInTz,
  getProfileData,
  listWorkouts,
} from "../../../../lib/api/data";
import { apiError, apiJson, withApi } from "../../../../lib/api/log";
import { parseWorkout } from "../../../../lib/api/payloads";
import { readRange } from "../../../../lib/api/query";
import { readBody } from "../../../../lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "list_workouts", scope: "health:read" }, async (auth) => {
    const params = new URL(req.url).searchParams;
    const profile = await getProfileData(auth.userId);

    const range = readRange(params, { timezone: profile.timezone, defaultDays: 7 });
    if (!range.ok) return apiError(range.status, range.code, range.message);

    const result = await listWorkouts(auth.userId, {
      from: range.from,
      to: range.to,
      timezone: range.timezone,
    });

    return apiJson(result.workouts, {
      timezone: result.timezone,
      from: result.from,
      to: result.to,
      count: result.workouts.length,
    });
  });
}

export async function POST(req) {
  return withApi(req, { tool: "log_workout", scope: "workouts:write" }, async (auth) => {
    const parsed = await readBody(req);
    if (!parsed.ok) return apiError(parsed.status, parsed.code, parsed.message);

    const checked = parseWorkout(parsed.body);
    if (!checked.ok) return apiError(checked.status, checked.code, checked.message);

    const workout = await addWorkout(auth.userId, checked.values);

    const profile = await getProfileData(auth.userId);
    const date = dateInTz(profile.timezone, new Date(workout.started_at));

    return apiJson(
      { workout },
      { timezone: profile.timezone, date },
      { status: 201 }
    );
  });
}
