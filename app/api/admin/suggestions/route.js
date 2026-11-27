// GET   /api/admin/suggestions  → lista el feedback de los usuarios
// PATCH /api/admin/suggestions  → { id, status: 'new' | 'read' }
//
// Solo admin con sesión de la web (requireAdmin). La tabla tiene RLS sin
// policies: acá se lee con service_role.
import { requireAdmin } from "../../../../lib/api/admin";
import { apiError } from "../../../../lib/api/log";
import { serviceClient } from "../../../../lib/api/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const STATUSES = ["new", "read"];

export async function GET(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return apiError(admin.status, admin.code, admin.message);

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const [list, total, unread] = await Promise.all([
    db
      .from("suggestions")
      .select("id, email, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("suggestions").select("id", { count: "exact", head: true }),
    db
      .from("suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  if (list.error)
    return apiError(500, "server_error", "No se pudieron leer las sugerencias.");

  return Response.json(
    {
      suggestions: list.data || [],
      counts: {
        total: total.count || 0,
        unread: unread.count || 0,
      },
    },
    { headers: NO_STORE }
  );
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

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status = body?.status;
  if (!id) return apiError(400, "invalid_id", "Falta el id de la sugerencia.");
  if (!STATUSES.includes(status))
    return apiError(400, "invalid_status", "El estado no es válido.");

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const { data, error } = await db
    .from("suggestions")
    .update({ status })
    .eq("id", id)
    .select("id, email, message, status, created_at")
    .maybeSingle();

  if (error)
    return apiError(500, "server_error", "No se pudo actualizar la sugerencia.");
  if (!data)
    return apiError(404, "suggestion_not_found", "La sugerencia no existe.");

  return Response.json({ suggestion: data }, { headers: NO_STORE });
}
