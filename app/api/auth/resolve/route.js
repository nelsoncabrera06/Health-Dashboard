import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Resuelve un identificador (email o username) al email de Auth.
// El navegador no puede leer `profiles` ajenos (RLS own-rows), así que
// la búsqueda se hace acá con service_role. No lista usuarios: solo
// resuelve de a uno. Si es email, se devuelve sin tocar la DB.
export async function GET(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Falta configurar Supabase en el servidor." },
      { status: 500 }
    );
  }

  const identifier = (
    new URL(request.url).searchParams.get("identifier") || ""
  ).trim();
  if (!identifier || identifier.length > 254) {
    return NextResponse.json(
      { error: "Identificador inválido." },
      { status: 400 }
    );
  }

  // Caso email: Auth trabaja con email, no hay nada que resolver.
  if (identifier.includes("@")) {
    return NextResponse.json({ email: identifier.toLowerCase() });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .ilike("username", identifier)
    .limit(1)
    .maybeSingle();

  if (error || !data?.email) {
    return NextResponse.json(
      { error: "No se encontró ese usuario." },
      { status: 404 }
    );
  }
  return NextResponse.json({ email: data.email });
}
