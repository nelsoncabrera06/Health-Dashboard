// GET   /api/admin/notifications  → estado del resumen diario
// PATCH /api/admin/notifications  → { enabled: true|false }
// POST  /api/admin/notifications  → envía el resumen ahora (prueba/manual)
//
// Solo admin con sesión de la web (requireAdmin).
import { requireAdmin } from "../../../../lib/api/admin";
import { apiError } from "../../../../lib/api/log";
import {
  getNotificationsStatus,
  sendSignupDigest,
  setNotificationsEnabled,
} from "../../../../lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return apiError(admin.status, admin.code, admin.message);

  const status = await getNotificationsStatus();
  return Response.json(status, { headers: NO_STORE });
}

export async function PATCH(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return apiError(admin.status, admin.code, admin.message);

  let body;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body", "El cuerpo no es JSON válido.");
  }

  if (typeof body?.enabled !== "boolean")
    return apiError(400, "invalid_body", "`enabled` tiene que ser true o false.");

  const saved = await setNotificationsEnabled(body.enabled, admin.userId);
  if (!saved.ok) return apiError(saved.status, saved.code, saved.message);

  const status = await getNotificationsStatus();
  return Response.json(status, { headers: NO_STORE });
}

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return apiError(admin.status, admin.code, admin.message);

  const result = await sendSignupDigest({ manual: true });
  if (!result.ok)
    return apiError(result.status || 500, result.code, result.message);

  return Response.json(result, { headers: NO_STORE });
}
