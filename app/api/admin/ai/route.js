// GET    /api/admin/ai  → config activa, catálogo y qué providers tienen key
// PATCH  /api/admin/ai  → { provider, model } elegido en /admin
// DELETE /api/admin/ai  → borra la config del panel: vuelve al default de env
//
// Solo admin con sesión de la web (ver lib/api/admin.js). El modelo solo puede
// ser uno del catálogo (lib/aiCatalog.js): el panel no puede dejar el chat
// apuntando a algo inexistente o sin API key.
import { requireAdmin } from "../../../../lib/api/admin";
import { apiError } from "../../../../lib/api/log";
import { MODELS, PROVIDER_LABELS } from "../../../../lib/aiCatalog";
import {
  VOICE_PROVIDERS,
  envVoiceConfig,
  voiceProviderHasKey,
} from "../../../../lib/voiceCatalog";
import {
  envAiConfig,
  getAiConfig,
  providerHasKey,
  resetAiConfig,
  setAiConfig,
} from "../../../../lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function providersWithKey() {
  const out = {};
  for (const provider of Object.keys(PROVIDER_LABELS)) {
    out[provider] = {
      label: PROVIDER_LABELS[provider],
      hasKey: providerHasKey(provider),
    };
  }
  return out;
}

// La voz es solo lectura: se configura por entorno. Se muestra igual para que
// el admin sepa con qué provider/modelo se transcriben las notas.
function voiceState() {
  return {
    current: envVoiceConfig(),
    providers: VOICE_PROVIDERS.map((p) => ({
      provider: p.provider,
      label: p.label,
      note: p.note,
      hasKey: voiceProviderHasKey(p.provider),
      models: p.models,
    })),
  };
}

// Devolver el estado completo después de cada cambio evita un refetch en la UI.
async function state() {
  return {
    current: await getAiConfig(),
    fallback: envAiConfig(),
    catalog: MODELS,
    providers: providersWithKey(),
    voice: voiceState(),
  };
}

export async function GET(req) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);

  return Response.json(await state(), { headers: NO_STORE });
}

export async function PATCH(req) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);

  let body;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido.");
  }

  const provider = typeof body?.provider === "string" ? body.provider : "";
  const model = typeof body?.model === "string" ? body.model : "";

  const res = await setAiConfig(provider, model, guard.userId);
  if (!res.ok) return apiError(res.status, res.code, res.message);

  return Response.json(await state(), { headers: NO_STORE });
}

export async function DELETE(req) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);

  const res = await resetAiConfig();
  if (!res.ok) return apiError(res.status, res.code, res.message);

  return Response.json(await state(), { headers: NO_STORE });
}
