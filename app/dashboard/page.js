"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../components/AuthContext";
import AuthModal from "../../components/AuthModal";

export default function Dashboard() {
  const { user, ready, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (!ready) {
    return (
      <main className="dash">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="dash">
        <div className="card">
          <h2>Necesitás iniciar sesión</h2>
          <p className="muted">El dashboard es solo para usuarios registrados.</p>
          <br />
          <div className="btn-row" style={{ justifyContent: "flex-start" }}>
            <button className="btn" onClick={() => setModalOpen(true)}>
              Entrar / Crear cuenta
            </button>
            <Link className="btn btn-secondary" href="/">
              ← Volver al inicio
            </Link>
          </div>
        </div>
        <AuthModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </main>
    );
  }

  return (
    <main className="dash">
      <div className="card">
        <h2>Hola, {user.displayName || user.username} 💪</h2>
        <p className="muted">
          {user.email} · plan {user.tier} · {user.status}
        </p>
        <br />
        <div className="btn-row" style={{ justifyContent: "flex-start" }}>
          <Link className="btn btn-secondary" href="/">
            ← Inicio
          </Link>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            Salir
          </button>
        </div>
      </div>
      <div className="card">
        <p className="muted">
          Dashboard de nutrición en construcción (paso 8 del plan). Tus datos
          ya están en Supabase.
        </p>
        <br />
        <Link href="/">← Volver</Link>
      </div>
    </main>
  );
}
