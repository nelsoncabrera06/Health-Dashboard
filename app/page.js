"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthContext";
import AuthModal from "../components/AuthModal";

export default function Home() {
  const { user, ready, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  // Logueado no tiene nada que hacer acá: directo al dashboard.
  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  if (!ready || user) {
    return (
      <main className="home">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="home">
      <h1>🏋️ Health Dashboard</h1>
      <p>Nutrición y entrenamiento, para todos.</p>
      <button className="btn" onClick={() => setModalOpen(true)}>
        Entrar / Crear cuenta
      </button>
      <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
