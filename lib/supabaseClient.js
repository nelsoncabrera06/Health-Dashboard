"use client";

import { createClient } from "@supabase/supabase-js";

// Cliente único para el navegador. Sesión en localStorage con auto-refresh;
// nunca manejamos tokens a mano.
// Lazy (singleton por request): crearlo a nivel módulo rompe el build si
// faltan las env vars (Vercel evalúa los imports al prerenderizar).
let client = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY."
      );
    }
    client = createClient(url, anonKey);
  }
  return client;
}
