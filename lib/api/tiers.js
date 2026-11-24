// Límites por tier. Es la única fuente de verdad: la usan las API keys
// (`keys`, `requestsPerDay`) y el chat (`chatMessagesPerDay`).
// Los números de pro/premium son provisorios hasta que los planes estén
// definidos (Nelson, 21-nov-2026): free es el que importa hoy.
// Nelson, 24-nov-2026: el cupo del chat va atado al TIER, no al rol. Un admin
// con tier free tiene el cupo de free (si quiere más, se cambia el tier).
export const TIER_LIMITS = {
  free: { keys: 1, requestsPerDay: 1000, chatMessagesPerDay: 30 },
  pro: { keys: 3, requestsPerDay: 10000, chatMessagesPerDay: 100 },
  premium: { keys: 10, requestsPerDay: 100000, chatMessagesPerDay: 500 },
};

// La demo es un ROL, no un tier: cuenta pública y compartida, sin API keys y
// con un cupo de prueba bajo para que alcance para probar y no para vivir ahí.
export const DEMO_CHAT_MESSAGES_PER_DAY = 7;

export function limitsFor(tier) {
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
}
