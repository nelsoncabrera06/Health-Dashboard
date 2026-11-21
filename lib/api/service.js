// Cliente Supabase con service_role para las rutas de API.
//
// IMPORTANTE: service_role BYPASSA RLS. Cada query tiene que filtrar el
// user_id a mano; no hay red de seguridad del lado de la base.
//
// Lazy: crearlo a nivel módulo rompe el build de Vercel si faltan las env vars
// (el build evalúa los imports en "Collecting page data").
import { createClient } from "@supabase/supabase-js";

let client = null;

export function serviceClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export function isServerConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
