// GET   /api/admin/users  → lista de usuarios + valores válidos de role/tier/status
// PATCH /api/admin/users  → { id, role?, tier?, status? } edita los privilegios
//
// Solo admin con sesión de la web (requireAdmin). La escritura usa service_role,
// que bypassa RLS y además pasa el trigger `protect_profile_privileges` porque
// `auth.uid()` es null con esa key (ver migración 008).
//
// El borrado sigue en /api/admin/delete-user, que ya bloquea la cuenta demo.
import { requireAdmin } from "../../../../lib/api/admin";
import { apiError } from "../../../../lib/api/log";
import { serviceClient } from "../../../../lib/api/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const ROLES = ["user", "admin", "demo"];
const TIERS = ["free", "pro", "premium"];
const STATUSES = ["active", "trial", "canceled"];

const FIELDS =
  "id, email, username, display_name, role, tier, status, created_at";

export async function GET(req) {
  const guard = await requireAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const { data, error } = await db
    .from("profiles")
    .select(FIELDS)
    .order("created_at", { ascending: true });

  if (error)
    return apiError(500, "server_error", "No se pudo leer la lista de usuarios.");

  return Response.json(
    {
      users: data || [],
      total: (data || []).length,
      options: { roles: ROLES, tiers: TIERS, statuses: STATUSES },
    },
    { headers: NO_STORE }
  );
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

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return apiError(400, "invalid_body", "Falta el id del usuario.");

  const patch = {};
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role))
      return apiError(400, "invalid_role", "Rol inválido.");
    patch.role = body.role;
  }
  if (body.tier !== undefined) {
    if (!TIERS.includes(body.tier))
      return apiError(400, "invalid_tier", "Plan inválido.");
    patch.tier = body.tier;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status))
      return apiError(400, "invalid_status", "Estado inválido.");
    patch.status = body.status;
  }
  if (!Object.keys(patch).length)
    return apiError(400, "invalid_body", "No hay cambios para guardar.");

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const { data: target, error: readError } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();

  if (readError)
    return apiError(500, "server_error", "No se pudo leer el usuario.");
  if (!target) return apiError(404, "user_not_found", "Ese usuario no existe.");

  // Quitarse el rol a uno mismo deja la app sin administrador y no hay UI para
  // revertirlo (los roles se asignan por SQL). Se bloquea a propósito.
  if (id === guard.userId && patch.role && patch.role !== "admin")
    return apiError(
      400,
      "cannot_change_own_role",
      "No podés quitarte el rol de admin a vos mismo."
    );

  // La demo es la cuenta pública compartida: su rol no se toca desde acá.
  if (target.role === "demo" && patch.role && patch.role !== "demo")
    return apiError(
      403,
      "demo_role_locked",
      "La cuenta demo es pública: su rol no se puede cambiar."
    );

  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select(FIELDS)
    .single();

  if (error)
    return apiError(400, "update_failed", "No se pudo guardar el cambio.");

  return Response.json({ user: data }, { headers: NO_STORE });
}
