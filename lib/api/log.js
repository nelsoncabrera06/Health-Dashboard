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

// Respuesta exitosa con el formato estable de la API: { data, meta }.
// Sin cache: son datos de salud que cambian con cada registro.
export function apiJson(data, meta, init) {
  return Response.json(
    { data, meta: meta || {} },
    {
      ...init,
      headers: { "Cache-Control": "no-store", ...(init?.headers || {}) },
    }
  );
}

// `?pretty=1` devuelve el JSON indentado. Existe para que el ejemplo de
// `/api-keys` y `/developers` se lea sin instalar jq: un JSON de una sola línea
// en una terminal no se entiende, y pedirle una dependencia al que recién
// llega es una barrera innecesaria. Con jq igual funciona (jq ignora espacios).
function wantsPretty(req) {
  try {
    const value = new URL(req.url).searchParams.get("pretty");
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

async function prettyResponse(res) {
  const text = await res.text();
  let body;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return new Response(text, { status: res.status, headers: res.headers });
  }
  const headers = new Headers(res.headers);
  headers.delete("content-length"); // el body cambió de tamaño
  return new Response(body, { status: res.status, headers });
}

export async function withApi(req, options, handler) {
  const pretty = wantsPretty(req);
  const send = async (res) => (pretty ? prettyResponse(res) : res);

  const auth = await authenticate(req);
  if (!auth.ok) return send(apiError(auth.status, auth.code, auth.message));

  if (options?.scope && !hasScope(auth, options.scope)) {
    const denied = missingScope(options.scope);
    return send(apiError(denied.status, denied.code, denied.message));
  }

  // Solo las API keys tienen cupo; la sesión de la web no se limita.
  if (auth.kind === "key" && auth.limits) {
    const usage = await bumpUsage(auth.keyId, auth.limits.requestsPerDay);
    if (!usage.allowed) {
      return send(
        apiError(
          429,
          "rate_limited",
          `Límite diario de la API alcanzado (${usage.limit} requests). Probá mañana.`,
          { limit: usage.limit }
        )
      );
    }
  }

  try {
    return await send(await handler(auth));
  } catch (e) {
    return await send(
      apiError(500, "internal", e?.message || "Error interno.")
    );
  }
}
