// Helpers de nutrición sobre Supabase (tablas meals + profiles).
// RLS own-rows: solo se leen/escriben filas del usuario logueado.
import { getSupabase } from "./supabaseClient";

// Defaults generales (no atados a un usuario). Si el perfil tiene
// targets propios, esos mandan.
export const DEFAULT_TARGETS = {
  calories: 2400,
  protein: 180,
  carbs: 220,
  fat: 80,
};

export async function getTargets(userId) {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from("meals")
    .select("id, meal, calories, protein, carbs, fat, eaten_at")
    .eq("user_id", userId)
    .gte("eaten_at", todayStartISO())
    .order("eaten_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getRecentMeals(userId, limit = 8) {
  const { data, error } = await supabase
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
  const { error } = await supabase
    .from("meals")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export function sumMacros(meals) {
  return (meals || []).reduce(
    (s, m) => ({
      calories: s.calories + (Number(m.calories) || 0),
      protein: s.protein + (Number(m.protein) || 0),
      carbs: s.carbs + (Number(m.carbs) || 0),
      fat: s.fat + (Number(m.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function getTodayWorkouts(userId) {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from("meals")
    .select("calories, eaten_at")
    .eq("user_id", userId)
    .gte("eaten_at", since.toISOString());
  if (error) throw error;
  return data || [];
}

// Agrupa calorías por día local, del más viejo al más nuevo.
export function groupCaloriesByDay(meals, days = 7) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toDateString();
    const label = d.toLocaleDateString("es", { weekday: "short" });
    const total = (meals || [])
      .filter((m) => new Date(m.eaten_at).toDateString() === key)
      .reduce((s, m) => s + (Number(m.calories) || 0), 0);
    out.push({ key, label, calories: Math.round(total) });
  }
  return out;
}

export async function getRecentWeights(userId, limit = 8) {
  const { data, error } = await supabase
    .from("weights")
    .select("id, weight_kg, measured_at")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
