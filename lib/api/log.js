// Envoltorio de las rutas de API: auth + scope + rate limit + audit log.
//
// Uso:
//   export async function GET(req) {
//     return withApi(req, { tool: "get_day_summary", scope: "health:read" },
//       async (auth) => Response.json({ ... }));
//   }
//
// El audit log guarda tool/status/ms, NUNCA el body (son datos de salud).
import { authenticate, hasScope, missingScope } from "./auth";
import { bumpUsage } from "./ratelimit";
import { serviceClient } from "./service";

export function apiError(status, code, message, extra) {
  return Response.json(
    { error: message, code, ...(extra || {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function logRequest(entry) {
  try {
    const db = serviceClient();
    if (!db) return;
    await db.from("api_requests").insert({
      key_id: entry.keyId || null,
      user_id: entry.userId || null,
      tool: entry.tool || null,
      method: entry.method || null,
      path: entry.path || null,
      status: entry.status ?? null,
      ms: entry.ms ?? null,
    });
  } catch {
    // el audit log nunca puede tirar abajo una respuesta
  }
}

export async function withApi(req, options, handler) {
  const started = Date.now();
  const method = req.method;
  const path = new URL(req.url).pathname;
  const tool = options?.tool || `${method} ${path}`;

  const auth = await authenticate(req);
  if (!auth.ok) {
    await logRequest({ method, path, tool, status: auth.status, ms: Date.now() - started });
    return apiError(auth.status, auth.code, auth.message);
  }

  if (options?.scope && !hasScope(auth, options.scope)) {
    const denied = missingScope(options.scope);
    await logRequest({
      userId: auth.userId,
      keyId: auth.keyId,
      method,
      path,
      tool,
      status: denied.status,
      ms: Date.now() - started,
    });
    return apiError(denied.status, denied.code, denied.message);
  }

  // Solo las API keys tienen cupo; la sesión de la web no se limita.
  if (auth.kind === "key" && auth.limits) {
    const usage = await bumpUsage(auth.keyId, auth.limits.requestsPerDay);
    if (!usage.allowed) {
      await logRequest({
        userId: auth.userId,
        keyId: auth.keyId,
        method,
        path,
        tool,
        status: 429,
        ms: Date.now() - started,
      });
      return apiError(
        429,
        "rate_limited",
        `Límite diario de la API alcanzado (${usage.limit} requests). Probá mañana.`,
        { limit: usage.limit }
      );
    }
  }

  try {
    const res = await handler(auth);
    await logRequest({
      userId: auth.userId,
      keyId: auth.keyId,
      method,
      path,
      tool,
      status: res?.status ?? 200,
      ms: Date.now() - started,
    });
    return res;
  } catch (e) {
    await logRequest({
      userId: auth.userId,
      keyId: auth.keyId,
      method,
      path,
      tool,
      status: 500,
      ms: Date.now() - started,
    });
    return apiError(500, "internal", e?.message || "Error interno.");
  }
}
