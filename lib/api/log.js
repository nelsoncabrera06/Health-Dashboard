// Envoltorio de las rutas de API: auth + scope + rate limit.
//
// Uso:
//   export async function GET(req) {
//     return withApi(req, { tool: "get_day_summary", scope: "health:read" },
//       async (auth) => Response.json({ ... }));
//   }
//
// No hay audit log de requests: guardar una fila por cada llamada de cada
// agente llenaba la base de ruido técnico. Lo que importa — cuándo registró el
// usuario cada comida, peso o entrenamiento — ya vive en el `created_at` de
// cada tabla.
import { authenticate, hasScope, missingScope } from "./auth";
import { bumpUsage } from "./ratelimit";

export function apiError(status, code, message, extra) {
  return Response.json(
    { error: message, code, ...(extra || {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function withApi(req, options, handler) {
  const auth = await authenticate(req);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  if (options?.scope && !hasScope(auth, options.scope)) {
    const denied = missingScope(options.scope);
    return apiError(denied.status, denied.code, denied.message);
  }

  // Solo las API keys tienen cupo; la sesión de la web no se limita.
  if (auth.kind === "key" && auth.limits) {
    const usage = await bumpUsage(auth.keyId, auth.limits.requestsPerDay);
    if (!usage.allowed) {
      return apiError(
        429,
        "rate_limited",
        `Límite diario de la API alcanzado (${usage.limit} requests). Probá mañana.`,
        { limit: usage.limit }
      );
    }
  }

  try {
    return await handler(auth);
  } catch (e) {
    return apiError(500, "internal", e?.message || "Error interno.");
  }
}
