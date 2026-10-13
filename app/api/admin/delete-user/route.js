import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Borra un usuario de Supabase Auth. Corre en servidor (service_role nunca
// va al navegador). Permite si es admin o si se borra a sí mismo.
export async function POST(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 500 }
    );
  }

  let targetId;
  try {
    ({ targetId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json({ error: "Falta el id del usuario." }, { status: 400 });
  }

  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const authClient = createClient(url, anonKey);
  const {
    data: { user: caller },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !caller) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  const isAdmin = callerProfile?.role === "admin";

  if (!isAdmin && caller.id !== targetId) {
    return NextResponse.json({ error: "No tenés permiso." }, { status: 403 });
  }

  // profiles y tablas de dominio caen en cascada (ON DELETE CASCADE).
  const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
