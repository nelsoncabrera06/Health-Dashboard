// Helpers puros de nutrición (sin Supabase).
//
// Viven separados de lib/health.js a propósito: las rutas de API corren en el
// servidor y no pueden importar lib/supabaseClient.js (que es "use client" y
// crea un cliente con sesión en localStorage).

// Defaults generales (no atados a un usuario). Si el perfil tiene targets
// propios, esos mandan.
export const DEFAULT_TARGETS = {
  calories: 2400,
  protein: 180,
  carbs: 220,
  fat: 80,
};

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
