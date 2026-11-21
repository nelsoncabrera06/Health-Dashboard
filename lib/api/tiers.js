// Límites por tier, atados a las API keys.
// Los números de pro/premium son provisorios hasta que los planes estén
// definidos (Nelson, 21-nov-2026): free es el que importa hoy.
export const TIER_LIMITS = {
  free: { keys: 1, requestsPerDay: 1000 },
  pro: { keys: 3, requestsPerDay: 10000 },
  premium: { keys: 10, requestsPerDay: 100000 },
};

export function limitsFor(tier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}
