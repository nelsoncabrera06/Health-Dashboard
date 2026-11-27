// GET /api/admin/view-as/[id]
//
// Devuelve los datos del usuario para el modo "Ver como" del admin (solo
// lectura). Usa service_role porque las policies de salud NO le dan acceso al
// admin: este endpoint es la única puerta, y exige JWT de admin.
//
// No escribe nada ni genera sesión del usuario: el navegador sigue con la
// sesión del admin y el dashboard solo muestra datos.
import { requireAdmin } from "../../../../../lib/api/admin";
import { apiError } from "../../../../../lib/api/log";
import { serviceClient } from "../../../../../lib/api/service";
import {
  DEFAULT_TZ,
  addDays,
  dateInTz,
  dayBounds,
  rangeBounds,
} from "../../../../../lib/api/data";
import { DEFAULT_TARGETS, creatineGrams } from "../../../../../lib/health-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MEAL_FIELDS =
  "id, meal, calories, protein, carbs, fat, eaten_at, source";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req, { params }) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return apiError(admin.status, admin.code, admin.message);

  const { id } = await params;
  if (!id || !UUID_RE.test(id))
    return apiError(400, "invalid_id", "El id del usuario no es válido.");

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (profileError)
    return apiError(500, "server_error", "No se pudo leer el perfil.");
  if (!profile)
    return apiError(404, "user_not_found", "Ese usuario no existe.");

  const tz = profile.timezone || DEFAULT_TZ;
  const today = dateInTz(tz);
  const todayBounds = dayBounds(today, tz);
  const weekBounds = rangeBounds({
    from: addDays(today, -89),
    to: today,
    timezone: tz,
  });
  const creatineStart = dayBounds(addDays(today, -6), tz).start;

  const [todayMeals, recentMeals, weekMeals, todayWorkouts, weights, creatine] =
    await Promise.all([
      db
        .from("meals")
        .select(MEAL_FIELDS)
        .eq("user_id", id)
        .gte("eaten_at", todayBounds.start)
        .lt("eaten_at", todayBounds.end)
        .order("eaten_at", { ascending: false }),
      db
        .from("meals")
        .select(MEAL_FIELDS)
        .eq("user_id", id)
        .order("eaten_at", { ascending: false })
        .limit(8),
      db
        .from("meals")
        .select("id, calories, protein, carbs, fat, eaten_at")
        .eq("user_id", id)
        .gte("eaten_at", weekBounds.start)
        .lt("eaten_at", weekBounds.end),
      db
        .from("workouts")
        .select("id, type, duration_min, calories_burned, notes, started_at")
        .eq("user_id", id)
        .gte("started_at", todayBounds.start)
        .lt("started_at", todayBounds.end)
        .order("started_at", { ascending: true }),
      db
        .from("weights")
        .select("id, weight_kg, measured_at")
        .eq("user_id", id)
        .order("measured_at", { ascending: false })
        .limit(365),
      db
        .from("meals")
        .select("id, meal, eaten_at")
        .eq("user_id", id)
        .eq("source", "supplement")
        .gte("eaten_at", creatineStart)
        .like("meal", "Creatina (%")
        .order("eaten_at", { ascending: false }),
    ]);

  const failed = [
    todayMeals,
    recentMeals,
    weekMeals,
    todayWorkouts,
    weights,
    creatine,
  ].find((r) => r.error);
  if (failed)
    return apiError(500, "server_error", "No se pudieron leer los datos.");

  const creatineWeek = (creatine.data || [])
    .map((row) => ({ ...row, grams: creatineGrams(row.meal) }))
    .filter((row) => Number.isFinite(row.grams));

  return Response.json(
    {
      user: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        display_name: profile.display_name,
        role: profile.role,
        tier: profile.tier,
        status: profile.status,
        provider: profile.provider,
        created_at: profile.created_at,
      },
      profile,
      targets: {
        calories: profile.calories_target ?? DEFAULT_TARGETS.calories,
        protein: profile.protein_target ?? DEFAULT_TARGETS.protein,
        carbs: profile.carbs_target ?? DEFAULT_TARGETS.carbs,
        fat: profile.fat_target ?? DEFAULT_TARGETS.fat,
      },
      todayMeals: todayMeals.data || [],
      recentMeals: recentMeals.data || [],
      weekMeals: weekMeals.data || [],
      todayWorkouts: todayWorkouts.data || [],
      weights: weights.data || [],
      creatineWeek,
      timezone: tz,
    },
    { headers: NO_STORE }
  );
}
