// Datos del perfil + objetivos diarios (onboarding).
//
// Los cálculos son una estimación estándar (Mifflin-St Jeor + factor de
// actividad) y se guardan en `profiles` para que el dashboard y el chat los
// usen sin recalcular. Editar el perfil recalcula todo.
import { getSupabase } from "./supabaseClient";

export const SEXES = [
  { value: "male", label: "Hombre", icon: "♂" },
  { value: "female", label: "Mujer", icon: "♀" },
];

export const ACTIVITY_LEVELS = [
  {
    value: "sedentary",
    label: "Sedentario",
    hint: "Casi sin ejercicio",
    factor: 1.2,
  },
  {
    value: "light",
    label: "Ligero",
    hint: "1-2x por semana",
    factor: 1.375,
  },
  {
    value: "moderate",
    label: "Moderado",
    hint: "2-3x por semana",
    factor: 1.55,
  },
  {
    value: "high",
    label: "Activo",
    hint: "4-5x por semana",
    factor: 1.725,
  },
  {
    value: "athlete",
    label: "Muy activo",
    hint: "6-7x o trabajo físico",
    factor: 1.9,
  },
];

// Categorías especiales. La clave se guarda en `profiles.diet_tags`; el label
// viaja al chat para que tenga en cuenta las restricciones.
export const DIET_TAGS = [
  { value: "vegetariano", label: "Vegetariano", icon: "🥗" },
  { value: "vegano", label: "Vegano", icon: "🌱" },
  { value: "pescetariano", label: "Pescetariano", icon: "🐟" },
  { value: "sin_lactosa", label: "Sin lactosa", icon: "🥛" },
  { value: "sin_gluten", label: "Sin gluten", icon: "🌾" },
  { value: "sin_frutos_secos", label: "Sin frutos secos", icon: "🥜" },
];

// País de referencia (ISO 3166-1 alpha-2). Los nombres salen de Intl para no
// mantener una tabla de 249 nombres a mano; se guarda solo el código.
const COUNTRY_CODES = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT",
  "AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW",
  "BV","BR","IO","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL",
  "CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ",
  "DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ",
  "FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP",
  "GU","GT","GG","GN","GW","GY","HT","HM","VA","HN","HK","HU","IS","IN","ID",
  "IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KP","KR",
  "KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY",
  "MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS",
  "MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MK",
  "MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR",
  "QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC","WS","SM","ST",
  "SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES",
  "LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO",
  "TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU",
  "VE","VN","VG","VI","WF","EH","YE","ZM","ZW",
];

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

function regionName(code) {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

export const COUNTRIES = COUNTRY_CODES.map((code) => ({
  code,
  name: regionName(code),
})).sort((a, b) => a.name.localeCompare(b.name, "es"));

const ACTIVITY_BY_KEY = Object.fromEntries(
  ACTIVITY_LEVELS.map((a) => [a.value, a])
);

export function sexLabel(value) {
  return SEXES.find((s) => s.value === value)?.label || "";
}

export function countryLabel(code) {
  return code ? regionName(code) : "";
}

export function dietLabel(value) {
  return DIET_TAGS.find((d) => d.value === value)?.label || value;
}

// El perfil viejo guardaba texto libre ("2-3x gym/semana"): se traduce a una
// clave conocida. Si no se reconoce, el wizard pide elegir de nuevo.
export function normalizeActivity(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (ACTIVITY_BY_KEY[raw]) return raw;
  const lower = raw.toLowerCase();
  const byText = ACTIVITY_LEVELS.find(
    (a) =>
      a.label.toLowerCase() === lower ||
      a.hint.toLowerCase() === lower ||
      `${a.label.toLowerCase()} (${a.hint.toLowerCase()})` === lower
  );
  if (byText) return byText.value;
  if (/sedent/.test(lower)) return "sedentary";
  if (/1\s*[-a]\s*2/.test(lower)) return "light";
  if (/2\s*[-a]\s*3/.test(lower)) return "moderate";
  if (/4\s*[-a]\s*5/.test(lower)) return "high";
  if (/6\s*[-a]\s*7|atleta/.test(lower)) return "athlete";
  return "";
}

export function activityLabel(value) {
  const key = normalizeActivity(value);
  return key ? ACTIVITY_BY_KEY[key].label : value || "";
}

// ── Cálculo de objetivos ────────────────────────────────────────
// BMR Mifflin-St Jeor, TDEE con factor de actividad y reparto de macros:
// proteína 1.8 g/kg, grasa 0.8 g/kg y el resto en carbos.
export function computeTargets(data) {
  const sex = data?.sex;
  const age = Number(data?.age);
  const height = Number(data?.height_cm);
  const weight = Number(data?.weight_kg);
  const goal = Number(data?.goal_weight_kg);
  const activity = ACTIVITY_BY_KEY[data?.activity];
  if (!["male", "female"].includes(sex) || !activity) return null;
  if (!(age >= 14 && age <= 100)) return null;
  if (!(height >= 100 && height <= 250)) return null;
  if (!(weight >= 30 && weight <= 300)) return null;
  if (!(goal >= 30 && goal <= 300)) return null;

  const base = 10 * weight + 6.25 * height - 5 * age;
  const bmr = sex === "male" ? base + 5 : base - 161;

  const tdee = Math.round((bmr * activity.factor) / 10) * 10;
  // Déficit del 20% (máx. 500 kcal) si quiere bajar; superávit suave del 10%
  // (máx. 300) si quiere subir. En personas chicas un -500 fijo es demasiado.
  const deficit = Math.min(500, Math.round((tdee * 0.2) / 10) * 10);
  const surplus = Math.min(300, Math.round((tdee * 0.1) / 10) * 10);
  const delta = goal < weight - 0.5 ? -deficit : goal > weight + 0.5 ? surplus : 0;
  const floor = sex === "female" ? 1200 : 1500;
  const calories = Math.max(floor, Math.round((tdee + delta) / 10) * 10);

  const protein = Math.round(weight * 1.8);
  const fat = Math.round(weight * 0.8);
  const carbs = Math.max(
    0,
    Math.round((calories - protein * 4 - fat * 9) / 4)
  );

  return { tdee, calories, protein, carbs, fat };
}

// ── Formulario (strings) ↔ datos (números) ──────────────────────
export function emptyForm() {
  return {
    sex: "",
    age: "30",
    height: "",
    weight: "",
    goal: "",
    activity: "",
    diets: [],
    country: "",
  };
}

export function profileToForm(profile, currentWeight) {
  return {
    sex: profile?.sex || "",
    age: profile?.age ? String(profile.age) : "30",
    height: profile?.height_cm ? String(profile.height_cm) : "",
    weight:
      currentWeight != null && currentWeight !== "" ? String(currentWeight) : "",
    goal: profile?.goal_weight_kg ? String(profile.goal_weight_kg) : "",
    activity: normalizeActivity(profile?.activity),
    diets: Array.isArray(profile?.diet_tags) ? profile.diet_tags : [],
    country: profile?.country || "",
  };
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export function parseForm(form) {
  return {
    sex: form.sex,
    age: num(form.age),
    height_cm: num(form.height),
    weight_kg: num(form.weight),
    goal_weight_kg: num(form.goal),
    activity: form.activity,
    diet_tags: Array.isArray(form.diets) ? form.diets : [],
    country: form.country || null,
  };
}

function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Guarda el perfil completo + el peso de hoy (tabla `weights`, que es la
// fuente de verdad del peso actual). RLS own-rows: solo toca filas propias.
export async function saveOnboarding(userId, data) {
  const targets = computeTargets(data);
  if (!targets) throw new Error("Faltan datos válidos para calcular tus objetivos.");
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from("profiles")
    .update({
      sex: data.sex,
      age: data.age,
      height_cm: data.height_cm,
      goal_weight_kg: data.goal_weight_kg,
      activity: data.activity,
      diet_tags: data.diet_tags,
      country: data.country || null,
      tdee: targets.tdee,
      calories_target: targets.calories,
      protein_target: targets.protein,
      carbs_target: targets.carbs,
      fat_target: targets.fat,
      onboarded_at: now,
      updated_at: now,
    })
    .eq("id", userId);
  if (error) throw error;

  // Un registro por día: si ya cargó el peso de hoy, se pisa con este.
  const { error: weightError } = await getSupabase()
    .from("weights")
    .upsert(
      {
        user_id: userId,
        weight_kg: data.weight_kg,
        measured_at: localDateISO(),
      },
      { onConflict: "user_id,measured_at" }
    );
  if (weightError) throw weightError;

  return targets;
}
