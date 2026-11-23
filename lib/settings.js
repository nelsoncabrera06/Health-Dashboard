// Configuración global editable desde /admin.
//
// `app_settings` guarda una fila por clave (`key = 'ai'`). Si no hay fila —o la
// tabla todavía no existe, porque la migración no se corrió— se cae a las env
// vars, así el chat se comporta exactamente igual que antes del panel.
//
// No hay cache a propósito: un cambio en /admin aplica al mensaje siguiente.

import { serviceClient } from "./api/service";
import { findModel, providerLabel } from "./aiCatalog";

export const AI_KEY = "ai";

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

export function providerHasKey(provider) {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}

// Default de siempre: lo que dice el entorno (y en producción, Vercel).
export function envAiConfig() {
  const provider = (process.env.AI_PROVIDER || "openrouter").trim().toLowerCase();
  const raw =
    provider === "gemini"
      ? process.env.GEMINI_MODEL
      : process.env.OPENROUTER_MODEL;
  return {
    provider,
    model: (raw || "").trim(),
    source: "env",
    updatedAt: null,
  };
}

// Fila de `app_settings` → config. Devuelve null si el modelo guardado ya no
// existe en el catálogo (se retiró): en ese caso se usa el default de env y el
// chat no se rompe por un dato viejo.
function fromRow(row) {
  const provider = String(row?.value?.provider || "").trim().toLowerCase();
  const model = String(row?.value?.model || "").trim();
  if (!findModel(provider, model)) return null;
  return {
    provider,
    model,
    source: "panel",
    updatedAt: row?.updated_at || null,
  };
}

export async function getAiConfig() {
  const fallback = envAiConfig();
  const db = serviceClient();
  if (!db) return fallback;

  const { data, error } = await db
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", AI_KEY)
    .maybeSingle();

  if (error || !data) return fallback;
  return fromRow(data) || fallback;
}

export async function setAiConfig(provider, model, userId) {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  const entry = findModel(provider, model);
  if (!entry)
    return fail(400, "invalid_model", "Ese modelo no está en el catálogo.");

  if (!providerHasKey(entry.provider))
    return fail(
      400,
      "missing_key",
      `Falta la API key de ${providerLabel(entry.provider)} en el servidor.`
    );

  const { data, error } = await db
    .from("app_settings")
    .upsert(
      {
        key: AI_KEY,
        value: { provider: entry.provider, model: entry.model },
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "key" }
    )
    .select("value, updated_at")
    .single();

  if (error || !data)
    return fail(500, "server_error", "No se pudo guardar la configuración.");

  return { ok: true, config: fromRow(data) };
}

// Volver al default de env: borra la fila del panel.
export async function resetAiConfig() {
  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  const { error } = await db.from("app_settings").delete().eq("key", AI_KEY);
  if (error)
    return fail(500, "server_error", "No se pudo borrar la configuración.");

  return { ok: true, config: envAiConfig() };
}
