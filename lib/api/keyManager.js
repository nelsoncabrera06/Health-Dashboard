// Gestión de API keys desde la web (/api-keys).
//
// Solo acepta sesión de la web (JWT de Supabase): una API key NO puede crear
// otra API key, así una key filtrada no escala sola.
//
// El token se genera y se devuelve UNA sola vez (en el POST de creación); en la
// base queda únicamente su SHA-256.
import { authenticate } from "./auth";
import { serviceClient } from "./service";
import { limitsFor } from "./tiers";
import {
  ALL_SCOPES,
  KEY_PREFIX,
  expiryDays,
  generateKey,
  hashKey,
  keyPrefix,
  normalizeScopes,
} from "./keys";

export const NAME_MAX = 60;

// La cuenta demo es pública (cualquiera entra con un botón): si además pudiera
// crear keys, sería una puerta de escritura abierta a internet.
export function isDemoEmail(email) {
  const demo = process.env.NEXT_PUBLIC_DEMO_EMAIL;
  return Boolean(demo && email && email.toLowerCase() === demo.toLowerCase());
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

// Resuelve el usuario y exige que sea JWT (no key).
export async function requireWebSession(req) {
  const auth = await authenticate(req);
  if (!auth.ok) return fail(auth.status, auth.code, auth.message);
  if (auth.kind !== "jwt")
    return fail(
      403,
      "jwt_required",
      "Esta operación requiere una sesión de la web, no una API key."
    );
  return { ok: true, auth };
}

// Lista las keys del usuario. Nunca devuelve el hash ni el token.
// La demo se bloquea también acá: su página de conexiones no debe existir.
export async function listKeys(userId, email) {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  if (isDemoEmail(email))
    return fail(
      403,
      "demo_not_allowed",
      "La cuenta demo no tiene API keys. Creá tu propia cuenta."
    );

  const { data, error } = await db
    .from("api_keys")
    .select("id, name, prefix, scopes, expires_at, revoked_at, last_used_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return fail(500, "server_error", "No se pudieron leer las API keys.");
  return { ok: true, keys: data || [] };
}

// Crea una key nueva. Valida nombre, scopes, vencimiento y el límite del tier.
export async function createKey(userId, email, input) {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  if (isDemoEmail(email))
    return fail(
      403,
      "demo_not_allowed",
      "La cuenta demo no puede crear API keys. Creá tu propia cuenta."
    );

  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name) return fail(400, "invalid_name", "Poné un nombre para identificar la key.");
  if (name.length > NAME_MAX)
    return fail(400, "invalid_name", `El nombre no puede pasar de ${NAME_MAX} caracteres.`);

  const days = expiryDays(input?.expiry);
  if (!days)
    return fail(
      400,
      "invalid_expiry",
      "Vencimiento inválido. Elegí 90 días, 6 meses o 1 año."
    );

  // Scopes: se descartan los desconocidos y `health:read` siempre va.
  const raw = Array.isArray(input?.scopes) ? input.scopes : [];
  const unknown = raw.filter((s) => !ALL_SCOPES.includes(s));
  if (unknown.length)
    return fail(400, "invalid_scopes", `Permiso inválido: ${unknown.join(", ")}.`);
  const scopes = normalizeScopes(raw);

  const { data: profile } = await db
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .maybeSingle();
  const limits = limitsFor(profile?.tier);

  // Solo cuentan las no revocadas: revocar libera el cupo aunque la key siga
  // en la lista como registro. Eliminar también, pero eso es obvio.
  const { count, error: countErr } = await db
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (countErr) return fail(500, "server_error", "No se pudieron contar las API keys.");
  if ((count ?? 0) >= limits.keys)
    return fail(
      403,
      "tier_limit",
      `Tu plan permite ${limits.keys} API key${limits.keys === 1 ? "" : "s"} activa${
        limits.keys === 1 ? "" : "s"
      }. Revocá una para crear otra.`
    );

  const token = generateKey();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data: created, error: insertErr } = await db
    .from("api_keys")
    .insert({
      user_id: userId,
      name,
      prefix: keyPrefix(token),
      scopes,
      expires_at: expiresAt,
    })
    .select("id, name, prefix, scopes, expires_at, revoked_at, last_used_at, created_at")
    .single();

  if (insertErr || !created)
    return fail(500, "server_error", "No se pudo crear la API key.");

  // Si el hash no se guarda, la key no sirve: mejor borrar la metadata que
  // dejar una key fantasma que nunca va a autenticar.
  const { error: secretErr } = await db
    .from("api_key_secrets")
    .insert({ key_id: created.id, hash: hashKey(token) });

  if (secretErr) {
    await db.from("api_keys").delete().eq("id", created.id);
    return fail(500, "server_error", "No se pudo crear la API key.");
  }

  // Único momento en que el token sale del servidor.
  return { ok: true, key: created, token };
}

const KEY_COLUMNS =
  "id, name, prefix, scopes, expires_at, revoked_at, last_used_at, created_at";

// Revocar es definitivo: la key deja de autenticar para siempre y queda en la
// lista como registro (tachada, con la fecha), sin forma de volver atrás. Si
// querés seguir usando el agente, creás una key nueva. El cupo del tier se
// libera igual, porque el límite cuenta solo las keys no revocadas.
export async function revokeKey(userId, keyId) {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  if (!keyId) return fail(400, "missing_id", "Falta el id de la key.");

  const { data, error } = await db
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    // El filtro por user_id es obligatorio: service_role bypassa RLS, así que
    // sin esto cualquiera revocaría la key de otro conociendo el uuid.
    .eq("user_id", userId)
    // Solo la primera vez: revocar algo ya revocado no es un éxito, es un 404.
    .is("revoked_at", null)
    .select(KEY_COLUMNS)
    .maybeSingle();

  if (error) return fail(500, "server_error", "No se pudo revocar la API key.");
  if (!data)
    return fail(404, "key_not_found", "La key no existe o ya estaba revocada.");

  return { ok: true, key: data };
}

// Borra la key de verdad, junto con su secreto y su contador de uso (RPC
// `delete_api_key`, transaccional). No queda nada atrás.
export async function deleteKey(userId, keyId) {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  if (!keyId) return fail(400, "missing_id", "Falta el id de la key.");

  // Se lee antes de borrar solo para devolver qué se borró.
  const { data: doomed } = await db
    .from("api_keys")
    .select(KEY_COLUMNS)
    .eq("id", keyId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: deleted, error } = await db.rpc("delete_api_key", {
    p_key: keyId,
    p_user: userId,
  });

  if (error) return fail(500, "server_error", "No se pudo eliminar la API key.");
  if (!deleted) return fail(404, "key_not_found", "La key no existe.");

  return { ok: true, key: doomed || { id: keyId } };
}

// Normaliza las env vars para que la UI pueda mostrar los snippets correctos.
export function mcpUrl(req) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (req ? new URL(req.url).origin : "https://nutritiondashboard.vercel.app");
  return `${base.replace(/\/$/, "")}/api/mcp`;
}

export { KEY_PREFIX };
