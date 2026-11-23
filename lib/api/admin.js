// Guard de las rutas de /admin.
//
// Solo sesión de la web (JWT, nunca API key) y `role = 'admin'`. La demo se
// bloquea explícitamente: es una cuenta pública y compartida, no administra
// nada global.
import { authenticate } from "./auth";
import { serviceClient } from "./service";

export async function requireAdmin(req) {
  const auth = await authenticate(req);
  if (!auth.ok)
    return { ok: false, status: auth.status, code: auth.code, message: auth.message };

  if (auth.kind !== "jwt")
    return {
      ok: false,
      status: 403,
      code: "jwt_required",
      message: "Esta operación requiere una sesión de la web, no una API key.",
    };

  const db = serviceClient();
  if (!db)
    return {
      ok: false,
      status: 500,
      code: "server_misconfigured",
      message: "Falta configurar Supabase en el servidor.",
    };

  const { data, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error)
    return {
      ok: false,
      status: 500,
      code: "server_error",
      message: "No se pudo leer el perfil.",
    };

  if (data?.role === "demo")
    return {
      ok: false,
      status: 403,
      code: "demo_not_allowed",
      message: "La cuenta demo no administra la configuración.",
    };

  if (data?.role !== "admin")
    return {
      ok: false,
      status: 403,
      code: "admin_required",
      message: "Solo para administradores.",
    };

  return { ok: true, userId: auth.userId };
}
