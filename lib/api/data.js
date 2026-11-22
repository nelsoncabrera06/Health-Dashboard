// Capa de datos para la API de agentes (REST /api/v1 y MCP /api/mcp).
//
// IMPORTANTE: usa el cliente service_role, que BYPASSA RLS. Por eso cada
// función recibe `userId` y filtra por él a mano. Nunca leer el user_id del body.
//
// Los cortes de día se calculan en la zona horaria del perfil (`profiles.timezone`),
// no en la del navegador ni en UTC: un agente en UTC registraría la cena en el
// día equivocado.
import { DEFAULT_TARGETS, sumMacros } from "../health-core";
import { serviceClient } from "./service";

export const DEFAULT_TZ = "America/Buenos_Aires";

// service_role bypassa RLS: sin este guard, un `db` nulo explota con un
// TypeError críptico en vez de un mensaje claro.
function requireDb() {
  const db = serviceClient();
  if (!db) throw new Error("Falta configurar Supabase en el servidor.");
  return db;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Fechas y zonas horarias (sin dependencias) ──────────────────

export function isDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "2026-11-21" en la zona pedida.
export function dateInTz(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Offset de la zona en minutos para un instante dado (maneja DST).
function tzOffsetMinutes(timeZone, at) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0; // "GMT" pelado = UTC
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// Instante UTC de la medianoche local de `date` en `timeZone`.
function localMidnightISO(date, timeZone) {
  const naive = new Date(date + "T00:00:00Z");
  let offset = tzOffsetMinutes(timeZone, naive);
  let utc = new Date(naive.getTime() - offset * 60_000);
  // Segundo pase: si la medianoche cae del otro lado de un cambio de horario,
  // el offset del instante corregido puede ser distinto.
  const offset2 = tzOffsetMinutes(timeZone, utc);
  if (offset2 !== offset) utc = new Date(naive.getTime() - offset2 * 60_000);
  return utc.toISOString();
}

// Rango [start, end) de un día local. `date` vacío = hoy en esa zona.
export function dayBounds(date, timeZone = DEFAULT_TZ) {
  const tz = timeZone || DEFAULT_TZ;
  const day = date || dateInTz(tz);
  if (!isDate(day)) throw new Error(`Fecha inválida: ${date}`);
  return {
    date: day,
    timezone: tz,
    start: localMidnightISO(day, tz),
    end: localMidnightISO(addDays(day, 1), tz),
  };
}

// Rango [start, end) de un rango de días locales (inclusive los dos extremos).
export function rangeBounds({ from, to, timezone } = {}) {
  const tz = timezone || DEFAULT_TZ;
  const endDay = to || from || dateInTz(tz);
  const startDay = from || endDay;
  if (!isDate(startDay) || !isDate(endDay))
    throw new Error("Fechas inválidas: usá YYYY-MM-DD.");
  if (startDay > endDay) throw new Error("'from' no puede ser posterior a 'to'.");
  return {
    from: startDay,
    to: endDay,
    timezone: tz,
    start: localMidnightISO(startDay, tz),
    end: localMidnightISO(addDays(endDay, 1), tz),
  };
}

// ── Perfil ─────────────────────────────────────────────────────

export async function getProfileData(userId) {
  const db = requireDb();
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;

  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name,
    email: data.email,
    tier: data.tier,
    status: data.status,
    sex: data.sex,
    age: data.age,
    height_cm: data.height_cm,
    goal_weight_kg: data.goal_weight_kg,
    activity: data.activity,
    country: data.country,
    diet_tags: data.diet_tags || [],
    timezone: data.timezone || DEFAULT_TZ,
    tdee: data.tdee,
    onboarded_at: data.onboarded_at,
    targets: {
      calories: data.calories_target ?? DEFAULT_TARGETS.calories,
      protein: data.protein_target ?? DEFAULT_TARGETS.protein,
      carbs: data.carbs_target ?? DEFAULT_TARGETS.carbs,
      fat: data.fat_target ?? DEFAULT_TARGETS.fat,
    },
  };
}

// ── Comidas ────────────────────────────────────────────────────

const MEAL_FIELDS =
  "id, meal, calories, protein, carbs, fat, eaten_at, client_ref";

export async function listMeals(userId, { from, to, timezone, limit = 200 } = {}) {
  const db = requireDb();
  const tz = timezone || (await getProfileData(userId)).timezone;
  const bounds = rangeBounds({ from, to, timezone: tz });
  const { data, error } = await db
    .from("meals")
    .select(MEAL_FIELDS)
    .eq("user_id", userId)
    .gte("eaten_at", bounds.start)
    .lt("eaten_at", bounds.end)
    .order("eaten_at", { ascending: true })
    .limit(Math.min(Number(limit) || 200, 500));
  if (error) throw error;
  return { ...bounds, meals: data || [] };
}

// Registra una comida. Si `client_ref` ya existe para ese usuario (reintento del
// agente), devuelve la fila existente en vez de duplicarla.
export async function addMeal(userId, payload) {
  const db = requireDb();
  const clientRef = payload.clientRef || null;
  const row = {
    user_id: userId,
    meal: payload.name,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
    eaten_at: payload.eatenAt || new Date().toISOString(),
    client_ref: clientRef,
  };

  const { data, error } = await db
    .from("meals")
    .insert(row)
    .select(MEAL_FIELDS)
    .single();

  if (!error) return { meal: data, duplicated: false };

  // 23505 = unique_violation (meals_user_client_ref_idx).
  if (error.code === "23505" && clientRef) {
    const { data: existing } = await db
      .from("meals")
      .select(MEAL_FIELDS)
      .eq("user_id", userId)
      .eq("client_ref", clientRef)
      .maybeSingle();
    if (existing) return { meal: existing, duplicated: true };
  }
  throw error;
}

// ── Resumen del día ────────────────────────────────────────────

export async function getDaySummary(userId, date) {
  const profile = await getProfileData(userId);
  const bounds = dayBounds(date, profile.timezone);
  const db = requireDb();

  const [mealsRes, workoutsRes] = await Promise.all([
    db
      .from("meals")
      .select(MEAL_FIELDS)
      .eq("user_id", userId)
      .gte("eaten_at", bounds.start)
      .lt("eaten_at", bounds.end)
      .order("eaten_at", { ascending: true }),
    db
      .from("workouts")
      .select("id, type, duration_min, calories_burned, notes, started_at")
      .eq("user_id", userId)
      .gte("started_at", bounds.start)
      .lt("started_at", bounds.end)
      .order("started_at", { ascending: true }),
  ]);
  if (mealsRes.error) throw mealsRes.error;
  if (workoutsRes.error) throw workoutsRes.error;

  const meals = mealsRes.data || [];
  const workouts = workoutsRes.data || [];
  const totals = sumMacros(meals);
  const burned = workouts.reduce(
    (s, w) => s + (Number(w.calories_burned) || 0),
    0
  );
  const targets = profile.targets;

  return {
    date: bounds.date,
    timezone: bounds.timezone,
    targets,
    totals,
    remaining: {
      calories: Math.round(targets.calories - totals.calories),
      protein: Math.round(targets.protein - totals.protein),
      carbs: Math.round(targets.carbs - totals.carbs),
      fat: Math.round(targets.fat - totals.fat),
    },
    burned,
    net: Math.round(totals.calories - burned),
    meals,
    workouts,
  };
}

// ── Pesos ──────────────────────────────────────────────────────

export async function listWeights(userId, { from, to } = {}) {
  const db = requireDb();
  const endDay = to || dateInTz(DEFAULT_TZ);
  const startDay = from || addDays(endDay, -30);
  if (!isDate(startDay) || !isDate(endDay))
    throw new Error("Fechas inválidas: usá YYYY-MM-DD.");
  const { data, error } = await db
    .from("weights")
    .select("id, weight_kg, measured_at")
    .eq("user_id", userId)
    .gte("measured_at", startDay)
    .lte("measured_at", endDay)
    .order("measured_at", { ascending: true });
  if (error) throw error;
  return { from: startDay, to: endDay, weights: data || [] };
}

// Un registro por día: si ya hay peso de esa fecha, se pisa.
// `measuredAt` viene ya resuelto por el llamador (la ruta usa la TZ del perfil).
export async function upsertWeight(userId, { weightKg, measuredAt, timezone }) {
  const db = requireDb();
  const { data, error } = await db
    .from("weights")
    .upsert(
      {
        user_id: userId,
        weight_kg: weightKg,
        measured_at: measuredAt || dateInTz(timezone || DEFAULT_TZ),
      },
      { onConflict: "user_id,measured_at" }
    )
    .select("id, weight_kg, measured_at")
    .single();
  if (error) throw error;
  return data;
}

// ── Ejercicios ─────────────────────────────────────────────────

export async function listWorkouts(userId, { from, to, timezone } = {}) {
  const db = requireDb();
  const tz = timezone || (await getProfileData(userId)).timezone;
  const bounds = rangeBounds({ from, to, timezone: tz });
  const { data, error } = await db
    .from("workouts")
    .select("id, type, duration_min, calories_burned, notes, started_at")
    .eq("user_id", userId)
    .gte("started_at", bounds.start)
    .lt("started_at", bounds.end)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return { ...bounds, workouts: data || [] };
}

export async function addWorkout(userId, payload) {
  const db = requireDb();
  const { data, error } = await db
    .from("workouts")
    .insert({
      user_id: userId,
      type: payload.type,
      duration_min: payload.durationMin ?? 0,
      calories_burned: payload.caloriesBurned ?? 0,
      notes: payload.notes || "",
      started_at: payload.startedAt || new Date().toISOString(),
    })
    .select("id, type, duration_min, calories_burned, notes, started_at")
    .single();
  if (error) throw error;
  return data;
}
