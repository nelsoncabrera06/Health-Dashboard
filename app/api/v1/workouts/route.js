// GET  /api/v1/workouts?from&to — entrenamientos del rango (default: últimos 7 días).
// POST /api/v1/workouts — registra un entrenamiento (scope workouts:write).
import {
  addWorkout,
  dateInTz,
  getProfileData,
  listWorkouts,
} from "../../../../lib/api/data";
import { apiError, apiJson, withApi } from "../../../../lib/api/log";
import { readRange } from "../../../../lib/api/query";
import {
  collect,
  num,
  readBody,
  text,
  timestamp,
} from "../../../../lib/api/validate";

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
    const body = parsed.body;

    const checked = collect({
      type: text(body.type, { field: "type", max: 60 }),
      durationMin: num(body.duration_min, {
        field: "duration_min",
        min: 0,
        max: 1440, // un día entero: más que eso es un error de unidad
        required: false,
      }),
      caloriesBurned: num(body.calories_burned, {
        field: "calories_burned",
        min: 0,
        max: 10000,
        required: false,
      }),
      notes: text(body.notes, { field: "notes", max: 500, required: false }),
      startedAt: timestamp(body.started_at, { field: "started_at" }),
    });
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
