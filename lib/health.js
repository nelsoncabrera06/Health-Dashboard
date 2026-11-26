// Helpers de nutrición sobre Supabase (tablas meals + profiles).
// RLS own-rows: solo se leen/escriben filas del usuario logueado.
import { getSupabase } from "./supabaseClient";
// Fuente única de los helpers puros: las rutas de API no pueden importar este
// módulo (es "use client"), así que viven en health-core y se reexportan acá.
import { DEFAULT_TARGETS, sumMacros } from "./health-core";

export { DEFAULT_TARGETS, sumMacros };

export async function getTargets(userId) {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("calories_target, protein_target, carbs_target, fat_target")
    .eq("id", userId)
    .single();
  if (error || !data) return { ...DEFAULT_TARGETS };
  return {
    calories: data.calories_target ?? DEFAULT_TARGETS.calories,
    protein: data.protein_target ?? DEFAULT_TARGETS.protein,
    carbs: data.carbs_target ?? DEFAULT_TARGETS.carbs,
    fat: data.fat_target ?? DEFAULT_TARGETS.fat,
  };
}

function todayStartISO() {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return n.toISOString();
}

export async function getTodayMeals(userId) {
  const { data, error } = await getSupabase()
    .from("meals")
    .select("id, meal, calories, protein, carbs, fat, eaten_at")
    .eq("user_id", userId)
    .gte("eaten_at", todayStartISO())
    .order("eaten_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getRecentMeals(userId, limit = 8) {
  const { data, error } = await getSupabase()
    .from("meals")
    .select("id, meal, calories, protein, carbs, fat, eaten_at")
    .eq("user_id", userId)
    .order("eaten_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function addMeal(userId, { meal, calories, protein, carbs, fat }) {
  const { error } = await getSupabase().from("meals").insert({
    user_id: userId,
    meal: (meal || "").trim(),
    calories: Number(calories) || 0,
    protein: Number(protein) || 0,
    carbs: Number(carbs) || 0,
    fat: Number(fat) || 0,
    eaten_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteMeal(userId, id) {
  const { error } = await getSupabase()
    .from("meals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getProfile(userId) {
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getTodayWorkouts(userId) {
  const { data, error } = await getSupabase()
    .from("workouts")
    .select("id, type, duration_min, calories_burned, notes, started_at")
    .eq("user_id", userId)
    .gte("started_at", todayStartISO())
    .order("started_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getMealsSince(userId, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  const { data, error } = await getSupabase()
    .from("meals")
    // El `id` es para poder mergear con el sandbox de la demo sin colapsar
    // filas (ver mergeMeals en lib/demoSandbox.js).
    .select("id, calories, protein, carbs, fat, eaten_at")
    .eq("user_id", userId)
    .gte("eaten_at", since.toISOString());
  if (error) throw error;
  return data || [];
}

// Agrupa un nutriente por día local, del más viejo al más nuevo.
// `field` es la columna de `meals`: calories | protein | carbs | fat. El
// dashboard lo usa para el gráfico grande, que cambia según la tarjeta elegida.
export function groupNutrientByDay(meals, days = 7, field = "calories") {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toDateString();
    const label = d.toLocaleDateString("es", { weekday: "short" });
    const total = (meals || [])
      .filter((m) => new Date(m.eaten_at).toDateString() === key)
      .reduce((s, m) => s + (Number(m[field]) || 0), 0);
    out.push({ key, label, value: Math.round(total) });
  }
  return out;
}

// Registra el peso de hoy. `weights` tiene unique (user_id, measured_at) con
// measured_at date-only, así que un segundo registro del día pisa el anterior
// (mismo criterio que el onboarding en lib/profile.js).
export async function addWeight(userId, weightKg) {
  const n = new Date();
  const measured_at = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(n.getDate()).padStart(2, "0")}`;
  const { error } = await getSupabase()
    .from("weights")
    .upsert(
      { user_id: userId, weight_kg: Number(weightKg), measured_at },
      { onConflict: "user_id,measured_at" }
    );
  if (error) throw error;
}

export async function getRecentWeights(userId, limit = 8) {
  const { data, error } = await getSupabase()
    .from("weights")
    .select("id, weight_kg, measured_at")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
