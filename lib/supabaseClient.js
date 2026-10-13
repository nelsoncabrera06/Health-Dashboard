"use client";

import { createClient } from "@supabase/supabase-js";

// Cliente único para el navegador. Sesión en localStorage con auto-refresh;
// nunca manejamos tokens a mano.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
