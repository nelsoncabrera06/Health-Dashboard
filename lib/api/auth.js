// Autenticación de las rutas de API / MCP.
//
// Acepta dos tipos de Bearer:
//   - API key  `hd_live_...`  → hash en api_key_secrets (service_role), scopes propios.
//   - Access token de Supabase (la web) → auth.getUser, scopes = todos (es el dueño).
//
// Devuelve siempre un objeto (nunca tira): { ok: true, ... } o { ok: false, status, code, message }.
import { createClient } from "@supabase/supabase-js";
import { ALL_SCOPES, hashKey, isApiKey } from "./keys";
import { serviceClient } from "./service";
import { limitsFor } from "./tiers";

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

function bearerToken(req) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function authenticate(req) {
  const token = bearerToken(req);
  if (!token)
    return fail(
      401,
      "missing_token",
      "Falta el header Authorization: Bearer <api_key>."
    );
  return isApiKey(token) ? authenticateKey(token) : authenticateJwt(token);
}

async function authenticateKey(token) {
  const db = serviceClient();
  if (!db)
    return fail(500, "server_misconfigured", "Falta configurar Supabase en el servidor.");

  const { data, error } = await db
    .from("api_key_secrets")
    .select(
      "key_id, api_keys!inner(id, user_id, scopes, expires_at, revoked_at, last_used_at, prefix)"
    )
    .eq("hash", hashKey(token))
    .maybeSingle();

  if (error) return fail(500, "server_error", "No se pudo validar la API key.");
  const key = data?.api_keys;
  if (!key) return fail(401, "invalid_key", "API key inválida.");

  if (key.revoked_at)
    return fail(401, "key_revoked", "La API key fue revocada.");
  if (new Date(key.expires_at) <= new Date())
    return fail(401, "key_expired", "La API key venció.");

  const [{ data: profile }] = await Promise.all([
    db.from("profiles").select("tier").eq("id", key.user_id).maybeSingle(),
    touchLastUsed(db, key),
  ]);

  return {
    ok: true,
    kind: "key",
    userId: key.user_id,
    scopes: Array.isArray(key.scopes) ? key.scopes : [],
    keyId: key.id,
    keyPrefix: key.prefix,
    expiresAt: key.expires_at,
    tier: profile?.tier || "free",
    limits: limitsFor(profile?.tier),
  };
}

// last_used_at se toca como mucho una vez por minuto: es solo informativo y no
// vale un UPDATE en cada request.
async function touchLastUsed(db, key) {
  const last = key.last_used_at ? new Date(key.last_used_at).getTime() : 0;
  if (Date.now() - last < 60_000) return;
  try {
    await db
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", key.id);
  } catch {
    // no romper la request por un dato de telemetría
  }
}

async function authenticateJwt(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    return fail(500, "server_misconfigured", "Falta configurar Supabase en el servidor.");

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user)
    return fail(401, "invalid_session", "Sesión inválida.");

  // El access token de la web es el dueño de la cuenta: todos los scopes.
  // (Si más adelante se suma OAuth, acá se mapean los scopes del token.)
  const db = serviceClient();
  const { data: profile } = db
    ? await db.from("profiles").select("tier").eq("id", data.user.id).maybeSingle()
    : { data: null };

  return {
    ok: true,
    kind: "jwt",
    userId: data.user.id,
    scopes: ALL_SCOPES,
    keyId: null,
    keyPrefix: null,
    expiresAt: null,
    tier: profile?.tier || "free",
    limits: null,
  };
}

export function hasScope(auth, scope) {
  return Array.isArray(auth?.scopes) && auth.scopes.includes(scope);
}

export function missingScope(scope) {
  return fail(
    403,
    "scope_required",
    `La API key no tiene el permiso "${scope}".`
  );
}
