"use client";

// /admin — configuración global de la app. Hoy: el modelo de AI.
//
// Solo `role = 'admin'`. El link del menú se oculta a los demás, pero la
// seguridad real está en la API (lib/api/admin.js): sesión de la web, rol admin
// y demo bloqueada. Es una página y no un modal porque hay varias tarjetas y se
// quiere ver el precio y la visión de cada modelo de un vistazo.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthContext";
import { getSupabase } from "../../lib/supabaseClient";

// La API devuelve { error, code } (ver `apiError` en lib/api/log.js).
function apiMessage(body, fallback) {
  return body?.error || body?.message || fallback;
}

function priceLabel(price) {
  if (!price) return "Gratis";
  return `US$ ${price.input} / ${price.output} por 1M`;
}

export default function AdminPage() {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [blockedCode, setBlockedCode] = useState("");

  // Aviso efímero, mismo patrón que /api-keys.
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const token = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    return data?.session?.access_token || null;
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/admin/ai", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setBlockedCode(body?.code || "");
        throw new Error(apiMessage(body, "No se pudo cargar la configuración."));
      }
      setBlockedCode("");
      setData(body);
    } catch (err) {
      setError(err.message || "No se pudo cargar la configuración.");
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

  const choose = async (entry) => {
    if (saving) return;
    setSaving(`${entry.provider}:${entry.model}`);
    setError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/ai", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: entry.provider, model: entry.model }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo cambiar el modelo."));
      setData(body);
      showToast(`Modelo activo: ${entry.label}. Aplica al próximo mensaje.`);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el modelo.");
    } finally {
      setSaving("");
    }
  };

  const reset = async () => {
    setSaving("reset");
    setError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/ai", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          apiMessage(body, "No se pudo volver al default del entorno.")
        );
      setData(body);
      showToast("Volviste al modelo por defecto del entorno.");
    } catch (err) {
      setError(err.message || "No se pudo volver al default del entorno.");
    } finally {
      setSaving("");
    }
  };

  if (!ready || (loading && !data)) {
    return (
      <div className="conn">
        <p className="muted">Cargando…</p>
      </div>
    );
  }

  const blocked =
    blockedCode === "admin_required" ||
    blockedCode === "demo_not_allowed" ||
    blockedCode === "jwt_required";

  const groups = (data?.catalog || []).reduce((acc, m) => {
    (acc[m.provider] ||= []).push(m);
    return acc;
  }, {});

  const currentEntry = (data?.catalog || []).find(
    (m) => m.provider === data?.current?.provider && m.model === data?.current?.model
  );
  const fallbackProvider = data?.providers?.[data?.fallback?.provider]?.label;

  return (
    <div className="conn admin">
      <header className="header">
        <Link href="/dashboard" className="brand">
          <div>
            <div className="title">Health Dashboard</div>
            <div className="subtitle">Admin · configuración</div>
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

      {blocked ? (
        <div className="card">
          <h2 className="conn-h2">Solo para administradores</h2>
          <p className="conn-sub">
            Esta página cambia la configuración de todos los usuarios, así que
            solo entra la cuenta del dueño. Tus datos y tu chat funcionan igual.
          </p>
          <Link href="/dashboard" className="btn">
            Volver al dashboard
          </Link>
        </div>
      ) : (
        <>
          {error && <p className="auth-error conn-error">{error}</p>}

          <p className="conn-intro">
            Elegí el modelo que usa el asistente para todos. Se aplica al mensaje
            siguiente, sin deploy: la elección se guarda en la base y el chat la
            lee en cada pedido. Si el modelo es pago, el gasto lo cubre la API key
            del servidor (OpenRouter tiene tope de US$ 1).
          </p>

          <section className="card conn-section">
            <div className="conn-section-head">
              <div>
                <h2 className="conn-h2">Modelo de AI</h2>
                <p className="conn-sub">
                  Los macros los estima el modelo; el registro de la comida lo
                  hace el botón de la UI.
                </p>
                {data?.current && (
                  <p className="admin-current">
                    Ahora:{" "}
                    <b>{currentEntry?.label || data.current.model}</b>{" "}
                    <code className="admin-card-id">{data.current.model}</code>{" "}
                    <span className="admin-badge">
                      {data.current.source === "panel"
                        ? "elegido en el panel"
                        : "default del entorno"}
                    </span>
                  </p>
                )}
              </div>
              {data?.current?.source === "panel" && (
                <button
                  className="btn btn-secondary"
                  onClick={reset}
                  disabled={Boolean(saving)}
                  title={`Volver a ${data.fallback?.model || "el default"}`}
                >
                  {saving === "reset" ? "Volviendo…" : "Volver al default"}
                </button>
              )}
            </div>

            {Object.entries(groups).map(([provider, models]) => {
              const info = data?.providers?.[provider];
              return (
                <div className="admin-provider" key={provider}>
                  <div className="admin-provider-head">
                    <h3 className="admin-h3">{info?.label || provider}</h3>
                    {!info?.hasKey && (
                      <span className="admin-badge off">
                        sin API key en el servidor
                      </span>
                    )}
                  </div>
                  <div className="admin-grid">
                    {models.map((m) => {
                      const active =
                        data?.current?.provider === m.provider &&
                        data?.current?.model === m.model;
                      const busy = saving === `${m.provider}:${m.model}`;
                      const usable = Boolean(info?.hasKey);
                      return (
                        <button
                          key={m.model}
                          type="button"
                          className={`admin-card${active ? " active" : ""}`}
                          onClick={() => choose(m)}
                          disabled={!usable || Boolean(saving)}
                          aria-pressed={active}
                          title={
                            usable
                              ? m.note || "Usar este modelo para todos"
                              : "Falta la API key de este provider en el servidor"
                          }
                        >
                          <div className="admin-card-name">{m.label}</div>
                          <div className="admin-card-id">{m.model}</div>
                          <div className="admin-badges">
                            <span
                              className={`admin-badge${
                                m.price ? "" : " on"
                              }`}
                            >
                              {priceLabel(m.price)}
                            </span>
                            <span
                              className={`admin-badge${
                                m.vision ? "" : " off"
                              }`}
                            >
                              {m.vision ? "Con visión" : "Sin visión"}
                            </span>
                            {active && (
                              <span className="admin-badge on">
                                {busy ? "Guardando…" : "Activo"}
                              </span>
                            )}
                          </div>
                          {m.note && (
                            <div className="admin-note">{m.note}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {data?.fallback && (
              <p className="admin-note">
                Default del entorno:{" "}
                {fallbackProvider || data.fallback.provider} ·{" "}
                <code className="admin-card-id">{data.fallback.model}</code>
              </p>
            )}
          </section>
        </>
      )}

      {toast && (
        <div className="conn-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
