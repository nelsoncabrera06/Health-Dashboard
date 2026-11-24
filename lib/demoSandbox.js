// Sandbox de la demo (Nelson, 24-nov-2026).
//
// La cuenta demo es UNA sola cuenta pública y compartida: todos los visitantes
// entran con el mismo `user_id`. Si el demo escribiera en Supabase, cada
// visitante vería (y podría borrar) lo que registró otro, y esos registros
// quedarían para siempre en la DB real.
//
// Por eso, para el rol `demo`, los registros viven SOLO en `sessionStorage` del
// navegador: se ven en el dashboard (se mergean con lo que ya trae la DB) y se
// borran al cerrar la pestaña o al volver a entrar a la demo. El seed de la DB
// no se toca: la demo lo sigue leyendo como dato de ejemplo, en modo lectura.
//
// Ojo: `sessionStorage` es por pestaña, no por navegador. Abrir la demo en dos
// pestañas da dos sandboxes separados, que es justo lo que se busca.

const MEALS_KEY = "hd.demo.meals";
const WEIGHTS_KEY = "hd.demo.weights";

function store() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key) {
  const s = store();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key, rows) {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(rows));
  } catch {
    // Storage lleno o bloqueado: el registro vive lo que dure el estado React.
  }
}

function localId(prefix) {
  const rnd =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rnd}`;
}

// Un id local se distingue porque arranca con "demo-". El dashboard lo usa para
// saber si puede ofrecer el borrado (las filas del seed son de solo lectura).
export function isLocalId(id) {
  return typeof id === "string" && id.startsWith("demo-");
}

export function readDemoMeals() {
  return read(MEALS_KEY);
}

export function addDemoMeal(input) {
  const row = {
    id: localId("demo-m"),
    meal: String(input?.meal || "").trim(),
    calories: Number(input?.calories) || 0,
    protein: Number(input?.protein) || 0,
    carbs: Number(input?.carbs) || 0,
    fat: Number(input?.fat) || 0,
    eaten_at: new Date().toISOString(),
  };
  write(MEALS_KEY, [row, ...readDemoMeals()]);
  return row;
}

export function deleteDemoMeal(id) {
  write(
    MEALS_KEY,
    readDemoMeals().filter((m) => m.id !== id)
  );
}

export function readDemoWeights() {
  return read(WEIGHTS_KEY);
}

// Mismo criterio que `addWeight` (lib/health.js): un peso por día, el último
// pisa al anterior. `measured_at` va como fecha sola ("YYYY-MM-DD") porque así
// lo espera WeightChart.
export function upsertDemoWeight(weightKg) {
  const d = new Date();
  const measured_at = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
  const row = {
    id: localId("demo-w"),
    weight_kg: Number(weightKg),
    measured_at,
  };
  write(WEIGHTS_KEY, [
    row,
    ...readDemoWeights().filter((w) => w.measured_at !== measured_at),
  ]);
  return row;
}

export function clearDemoSandbox() {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(MEALS_KEY);
    s.removeItem(WEIGHTS_KEY);
  } catch {
    // Nada que limpiar.
  }
}

// Une filas de la DB con las del sandbox (sin duplicar por id) y deja lo más
// nuevo primero, igual que las queries de lib/health.js.
// OJO: `getMealsSince` (el gráfico de calorías) trae solo `calories` y
// `eaten_at`, sin `id`. Esas filas NO se pueden deduplicar por id: si se hace
// (todas comparten `undefined`), colapsan en una sola y el gráfico se queda
// con un solo día.
export function mergeMeals(dbRows, localRows) {
  const byId = new Map();
  const anonymous = [];
  for (const m of [...(dbRows || []), ...(localRows || [])]) {
    if (!m) continue;
    if (m.id != null) byId.set(m.id, m);
    else anonymous.push(m);
  }
  return [...byId.values(), ...anonymous].sort(
    (a, b) => new Date(b.eaten_at) - new Date(a.eaten_at)
  );
}

// El peso se deduplica por fecha: el local pisa al de la DB del mismo día.
export function mergeWeights(dbRows, localRows) {
  const byDate = new Map();
  for (const w of dbRows || []) byDate.set(w.measured_at, w);
  for (const w of localRows || []) byDate.set(w.measured_at, w);
  return [...byDate.values()].sort((a, b) =>
    String(b.measured_at).localeCompare(String(a.measured_at))
  );
}
