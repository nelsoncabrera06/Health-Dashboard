"use client";

// /suggestions — feedback libre para el dueño del proyecto.
//
// Se abre desde el menú del usuario, al lado de "Mis datos" y "API keys".
// La tabla `suggestions` es privada (RLS sin policies): todo pasa por
// /api/suggestions con la sesión de la web. La demo no envía nada.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthContext";
import { getSupabase } from "../../lib/supabaseClient";
import "./suggestions.css";

const MIN = 10;
const MAX = 2000;

function apiMessage(body, fallback) {
  return body?.error || body?.message || fallback;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SuggestionsPage() {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const isDemo = user?.role === "demo";

  const token = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    if (user.role === "demo") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/suggestions", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudieron cargar tus mensajes."));
      setItems(body.suggestions || []);
    } catch (err) {
      setLoadError(err.message || "No se pudieron cargar tus mensajes.");
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSent(false);
    const text = message.trim();
    if (text.length < MIN) {
      setError(`Escribí al menos ${MIN} caracteres.`);
      return;
    }
    if (text.length > MAX) {
      setError(`El mensaje no puede superar los ${MAX} caracteres.`);
      return;
    }
    setSending(true);
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo enviar tu sugerencia."));
      setItems((prev) => [body.suggestion, ...prev].slice(0, 10));
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar tu sugerencia.");
    } finally {
      setSending(false);
    }
  };

  if (!ready || (loading && !items.length && !loadError)) {
    return (
      <div className="conn">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="conn">
      <header className="header">
        <Link href="/dashboard" className="brand">
          <div>
            <div className="title">Nutrition Dashboard</div>
            <div className="subtitle">Sugerencias · feedback</div>
          </div>
        </Link>
        <div className="header-right">
          <Link href="/dashboard" className="btn btn-secondary">
            ← Volver
          </Link>
          <button className="btn btn-secondary" onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <p className="conn-intro">
        Este espacio es para contarme qué mejorarías. Una idea, algo que no
        encontrás, un bug o simplemente qué te gustaría que haga la app: se
        envía directo al creador del proyecto.
      </p>

      {isDemo ? (
        <div className="card conn-demo">
          <h2 className="conn-h2">La cuenta demo no envía sugerencias</h2>
          <p className="conn-sub">
            La demo es una cuenta pública y compartida, así que el feedback
            tiene que ir con tu nombre. Creá tu cuenta y escribime desde ahí.
          </p>
          <Link href="/" className="btn">
            Crear mi cuenta
          </Link>
        </div>
      ) : (
        <>
          <section className="card conn-section sug-section">
            <div className="conn-section-head">
              <div>
                <h2 className="conn-h2">Contame qué mejorarías</h2>
                <p className="conn-sub">
                  Texto libre. No hay tema obligatorio: escribí lo que tengas
                  ganas.
                </p>
              </div>
            </div>

            <form className="sug-form" onSubmit={submit}>
              <textarea
                className="sug-textarea"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setSent(false);
                }}
                maxLength={MAX}
                rows={6}
                placeholder="Por ejemplo: me gustaría poder cargar recetas, o el gráfico de peso podría mostrar la semana..."
                aria-label="Tu sugerencia"
                disabled={sending}
              />
              <div className="sug-form-foot">
                <span
                  className={`sug-count${
                    message.length > MAX - 100 ? " near" : ""
                  }`}
                >
                  {message.length} / {MAX}
                </span>
                <button type="submit" className="btn" disabled={sending}>
                  {sending ? "Enviando…" : "Enviar sugerencia"}
                </button>
              </div>
              {error && <p className="auth-error">{error}</p>}
              {sent && (
                <p className="sug-ok" role="status">
                  ¡Gracias! Ya me llegó tu sugerencia.
                </p>
              )}
            </form>
          </section>

          <section className="card conn-section sug-section">
            <h2 className="conn-h2">Tus mensajes</h2>
            <p className="conn-sub">
              Los últimos que enviaste. “Recibido” significa que todavía no lo
              leí; “Leído”, que ya lo vi.
            </p>

            {loadError && <p className="auth-error conn-error">{loadError}</p>}

            {items.length === 0 ? (
              <p className="sug-empty">Todavía no enviaste ninguna sugerencia.</p>
            ) : (
              <ul className="sug-list">
                {items.map((s) => (
                  <li className="sug-item" key={s.id}>
                    <div className="sug-item-head">
                      <span className={`sug-status ${s.status}`}>
                        {s.status === "read" ? "Leído" : "Recibido"}
                      </span>
                      <span className="sug-date">{fmtDate(s.created_at)}</span>
                    </div>
                    <p className="sug-text">{s.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
