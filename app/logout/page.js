"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthContext";

// Salida de emergencia: borra la sesión y vuelve al inicio.
// Útil si el login quedó en un estado roto.
export default function Logout() {
  const { signOut, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    signOut().finally(() => router.replace("/"));
  }, [ready, signOut, router]);

  return <p style={{ padding: 24 }}>Cerrando sesión…</p>;
}
