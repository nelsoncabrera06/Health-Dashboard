"use client";

// /admin — panel de administración.
//
// Hoy tiene cuatro tabs:
//   1. "AI & API keys"  → modelo global del chat (el contenido original).
//   2. "Usuarios"       → listado de cuentas, edición de rol/tier/estado y borrado.
//   3. "Sugerencias"    → feedback libre de /suggestions, con "leído" por mensaje.
//   4. "Notificaciones" → switch del resumen diario de usuarios nuevos por email.
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

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ROLE_LABELS = { user: "Usuario", admin: "Admin", demo: "Demo" };
const TIER_LABELS = { free: "Free", pro: "Pro", premium: "Premium" };
const STATUS_LABELS = { active: "Activo", trial: "Trial", canceled: "Cancelado" };

// Respaldo si el GET de usuarios aún no llegó: la UI no depende de la API para
// dibujar los selects.
const DEFAULT_OPTIONS = {
  roles: ["user", "admin", "demo"],
  tiers: ["free", "pro", "premium"],
  statuses: ["active", "trial", "canceled"],
};

export default function AdminPage() {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState("ai");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [blockedCode, setBlockedCode] = useState("");

  // Tab Usuarios
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [editing, setEditing] = useState(null); // usuario en el modal
  const [editForm, setEditForm] = useState({ role: "", tier: "", status: "" });
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [deleting, setDeleting] = useState(null); // usuario a confirmar
  const [deleteError, setDeleteError] = useState("");

  // Tab Sugerencias
  const [suggestions, setSuggestions] = useState([]);
  const [sugLoading, setSugLoading] = useState(true);
  const [sugError, setSugError] = useState("");
  const [sugCounts, setSugCounts] = useState({ total: 0, unread: 0 });
  const [sugBusy, setSugBusy] = useState("");

  // Tab Notificaciones
  const [notif, setNotif] = useState(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState("");
  const [notifBusy, setNotifBusy] = useState("");

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

  const loadUsers = useCallback(async () => {
    if (!user) return;
    setUsersLoading(true);
    setUsersError("");
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo cargar la lista de usuarios."));
      setUsers(body.users || []);
      if (body.options) setOptions(body.options);
    } catch (err) {
      setUsersError(err.message || "No se pudo cargar la lista de usuarios.");
    } finally {
      setUsersLoading(false);
    }
  }, [user, token]);

  const loadSuggestions = useCallback(async () => {
    if (!user) return;
    setSugLoading(true);
    setSugError("");
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/admin/suggestions", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudieron cargar las sugerencias."));
      setSuggestions(body.suggestions || []);
      setSugCounts(body.counts || { total: 0, unread: 0 });
    } catch (err) {
      setSugError(err.message || "No se pudieron cargar las sugerencias.");
    } finally {
      setSugLoading(false);
    }
  }, [user, token]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    setNotifError("");
    try {
      const t = await token();
      if (!t) throw new Error("Sesión inválida. Volvé a iniciar sesión.");
      const res = await fetch("/api/admin/notifications", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          apiMessage(body, "No se pudo cargar la configuración de notificaciones.")
        );
      setNotif(body);
    } catch (err) {
      setNotifError(
        err.message || "No se pudo cargar la configuración de notificaciones."
      );
    } finally {
      setNotifLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);
  useEffect(() => {
    load();
  }, [load]);
  // El contador de la tab tiene que estar listo antes de abrirla.
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

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

  const openEdit = (u) => {
    setModalError("");
    setEditForm({ role: u.role, tier: u.tier, status: u.status });
    setEditing(u);
  };

  const closeEdit = () => {
    if (modalSaving) return;
    setEditing(null);
    setModalError("");
  };

  const saveEdit = async () => {
    if (!editing || modalSaving) return;
    setModalSaving(true);
    setModalError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: editing.id, ...editForm }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo guardar el cambio."));
      setUsers((prev) =>
        prev.map((u) => (u.id === editing.id ? { ...u, ...body.user } : u))
      );
      setEditing(null);
      showToast("Usuario actualizado.");
    } catch (err) {
      setModalError(err.message || "No se pudo guardar el cambio.");
    } finally {
      setModalSaving(false);
    }
  };

  const openDelete = (u) => {
    setDeleteError("");
    setDeleting(u);
  };

  const closeDelete = () => {
    setDeleting(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setModalSaving(true);
    setDeleteError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetId: deleting.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo eliminar el usuario."));
      setUsers((prev) => prev.filter((u) => u.id !== deleting.id));
      setDeleting(null);
      showToast("Usuario eliminado.");
    } catch (err) {
      setDeleteError(err.message || "No se pudo eliminar el usuario.");
    } finally {
      setModalSaving(false);
    }
  };

  const markSuggestion = async (s) => {
    if (sugBusy) return;
    const next = s.status === "read" ? "new" : "read";
    setSugBusy(s.id);
    setSugError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/suggestions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: s.id, status: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo actualizar la sugerencia."));
      setSuggestions((prev) =>
        prev.map((item) => (item.id === s.id ? body.suggestion : item))
      );
      setSugCounts((prev) => ({
        ...prev,
        unread: Math.max(0, prev.unread + (next === "read" ? -1 : 1)),
      }));
    } catch (err) {
      setSugError(err.message || "No se pudo actualizar la sugerencia.");
    } finally {
      setSugBusy("");
    }
  };

  const toggleNotifications = async () => {
    if (!notif || notifBusy) return;
    const enabled = !notif.enabled;
    setNotifBusy("toggle");
    setNotifError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo cambiar la preferencia."));
      setNotif(body);
      showToast(
        enabled
          ? "Notificaciones activadas. El próximo resumen sale a las 10:00."
          : "Notificaciones desactivadas. No se mandan más resúmenes."
      );
    } catch (err) {
      setNotifError(err.message || "No se pudo cambiar la preferencia.");
    } finally {
      setNotifBusy("");
    }
  };

  const sendDigestNow = async () => {
    if (notifBusy) return;
    setNotifBusy("send");
    setNotifError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(apiMessage(body, "No se pudo enviar el resumen."));
      if (body.sent) showToast(`Resumen enviado (${body.count} usuario${body.count === 1 ? "" : "s"}).`);
      else showToast("No hay usuarios nuevos para avisar.");
      loadNotifications();
    } catch (err) {
      setNotifError(err.message || "No se pudo enviar el resumen.");
    } finally {
      setNotifBusy("");
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
            <div className="title">Nutrition Dashboard</div>
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
          <div className="admin-tabs" role="tablist" aria-label="Secciones de administración">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ai"}
              className={`admin-tab${tab === "ai" ? " active" : ""}`}
              onClick={() => setTab("ai")}
            >
              AI &amp; API keys
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "users"}
              className={`admin-tab${tab === "users" ? " active" : ""}`}
              onClick={() => setTab("users")}
            >
              Usuarios
              <span className="admin-tab-count-group">
                <span className="admin-tab-count-sep">:</span>
                <span className="admin-tab-count-plain">
                  {usersLoading ? "—" : users.length}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "suggestions"}
              className={`admin-tab${tab === "suggestions" ? " active" : ""}`}
              onClick={() => setTab("suggestions")}
            >
              Sugerencias
              <span className="admin-tab-count-group">
                <span className="admin-tab-count-sep">:</span>
                <span className="admin-tab-count-plain">
                  {sugLoading ? "—" : sugCounts.total}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "notif"}
              className={`admin-tab${tab === "notif" ? " active" : ""}`}
              onClick={() => setTab("notif")}
            >
              Notificaciones
              <span className="admin-tab-count-group">
                <span className="admin-tab-count-sep">:</span>
                <span className="admin-tab-count-plain">
                  {notifLoading ? "—" : notif?.pending ?? 0}
                </span>
              </span>
            </button>
          </div>

          {tab === "ai" ? (
            <section className="admin-panel" role="tabpanel" aria-label="AI y API keys">
              {error && <p className="auth-error conn-error">{error}</p>}

              <p className="conn-intro">
                Elegí el modelo que usa el asistente para todos. Se aplica al
                mensaje siguiente, sin deploy: la elección se guarda en la base y
                el chat la lee en cada pedido. Si el modelo es pago, el gasto lo
                cubre la API key del servidor (OpenRouter tiene tope de US$ 1).
              </p>

              <div className="conn-section-head">
                <div>
                  <h2 className="conn-h2">Modelo de AI del chat</h2>
                  <p className="conn-sub">
                    Gemini (Google) y OpenRouter son los providers del chat:
                    responden el texto y las fotos, y estiman los macros. El
                    registro de la comida lo hace el botón de la UI.
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

              <p className="admin-subhead">Providers de chat</p>

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
                            {m.note && <div className="admin-note">{m.note}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {data?.fallback && (
                <p className="admin-note">
                  Default del entorno: {fallbackProvider || data.fallback.provider}{" "}
                  · <code className="admin-card-id">{data.fallback.model}</code>
                </p>
              )}

              {data?.voice && (
                <div className="admin-subsection">
                  <div className="conn-section-head">
                    <div>
                      <h2 className="conn-h2">Providers de voz</h2>
                      <p className="conn-sub">
                        Transcriben las notas de voz antes de que el chat las
                        lea, así la voz funciona con cualquier modelo del chat.
                        Hoy se configura por entorno (<code className="admin-inline-code">GROQ_STT_MODEL</code>).
                      </p>
                    </div>
                  </div>

                  {data.voice.providers.map((p) => {
                    const current =
                      data.voice.current?.provider === p.provider
                        ? data.voice.current.model
                        : null;
                    return (
                      <div className="admin-provider" key={p.provider}>
                        <div className="admin-provider-head">
                          <h3 className="admin-h3">{p.label}</h3>
                          {p.hasKey ? (
                            <span className="admin-badge on">API key cargada</span>
                          ) : (
                            <span className="admin-badge off">
                              sin API key en el servidor
                            </span>
                          )}
                          <span className="admin-badge">desde el entorno</span>
                        </div>

                        <div className="admin-grid">
                          {(p.models || []).map((m) => {
                            const active = current === m.model;
                            return (
                              <div
                                key={m.model}
                                className={`admin-card static${active ? " active" : ""}`}
                              >
                                <div className="admin-card-name">{m.label}</div>
                                <div className="admin-card-id">{m.model}</div>
                                <div className="admin-badges">
                                  {active ? (
                                    <span className="admin-badge on">En uso</span>
                                  ) : (
                                    <span className="admin-badge">
                                      Disponible
                                    </span>
                                  )}
                                </div>
                                {m.note && (
                                  <div className="admin-note">{m.note}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {p.note && <p className="admin-note">{p.note}</p>}

                        {!p.hasKey && (
                          <p className="admin-warn">
                            Sin API key las notas de voz no se pueden transcribir.
                            Cargá{" "}
                            <code className="admin-inline-code">GROQ_API_KEY</code>{" "}
                            en el servidor.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : tab === "users" ? (
            <section className="admin-panel" role="tabpanel" aria-label="Usuarios">
              <div className="admin-users-head">
                <div>
                  <h2 className="conn-h2">Usuarios</h2>
                  <p className="conn-sub">
                    {usersLoading
                      ? "Cargando…"
                      : `${users.length} ${
                          users.length === 1 ? "usuario registrado" : "usuarios registrados"
                        }`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadUsers}
                  disabled={usersLoading}
                >
                  {usersLoading ? "Actualizando…" : "Actualizar"}
                </button>
              </div>

              {usersError && (
                <p className="auth-error conn-error">{usersError}</p>
              )}

              <div className="admin-table-wrap">
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Tier</th>
                      <th>Estado</th>
                      <th>Creado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading && users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="admin-table-empty">
                          Cargando usuarios…
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="admin-table-empty">
                          No hay usuarios registrados.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        const self = u.id === user?.id;
                        const isDemo = u.role === "demo";
                        return (
                          <tr key={u.id}>
                            <td className="admin-user-email">{u.email || "—"}</td>
                            <td>{u.display_name || u.username || "—"}</td>
                            <td>
                              <span className={`admin-role ${u.role}`}>
                                {ROLE_LABELS[u.role] || u.role}
                              </span>
                            </td>
                            <td>{TIER_LABELS[u.tier] || u.tier || "—"}</td>
                            <td>
                              <span className={`admin-status ${u.status}`}>
                                {STATUS_LABELS[u.status] || u.status || "—"}
                              </span>
                            </td>
                            <td className="admin-user-date">{fmtDate(u.created_at)}</td>
                            <td className="admin-user-actions">
                              {self ? (
                                <span className="admin-own">Tu cuenta</span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="admin-mini-btn"
                                    onClick={() => openEdit(u)}
                                  >
                                    Editar
                                  </button>
                                  {isDemo ? (
                                    <span className="admin-own">No se borra</span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="admin-mini-btn danger"
                                      onClick={() => openDelete(u)}
                                    >
                                      Eliminar
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : tab === "suggestions" ? (
            <section
              className="admin-panel"
              role="tabpanel"
              aria-label="Sugerencias"
            >
              <div className="admin-users-head">
                <div>
                  <h2 className="conn-h2">Sugerencias</h2>
                  <p className="conn-sub">
                    {sugLoading
                      ? "Cargando…"
                      : `${sugCounts.total} en total · ${sugCounts.unread} sin leer`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadSuggestions}
                  disabled={sugLoading}
                >
                  {sugLoading ? "Actualizando…" : "Actualizar"}
                </button>
              </div>

              {sugError && <p className="auth-error conn-error">{sugError}</p>}

              <div className="admin-table-wrap">
                <table className="admin-users-table admin-sug-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Email</th>
                      <th>Mensaje</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugLoading && suggestions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-table-empty">
                          Cargando sugerencias…
                        </td>
                      </tr>
                    ) : suggestions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-table-empty">
                          Todavía no hay sugerencias.
                        </td>
                      </tr>
                    ) : (
                      suggestions.map((s) => (
                        <tr key={s.id}>
                          <td className="admin-user-date">
                            {fmtDate(s.created_at)}
                          </td>
                          <td className="admin-user-email">
                            {s.email || "—"}
                          </td>
                          <td className="admin-sug-message">{s.message}</td>
                          <td>
                            <span className={`admin-status ${s.status}`}>
                              {s.status === "read" ? "Leído" : "Nuevo"}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-mini-btn"
                              onClick={() => markSuggestion(s)}
                              disabled={sugBusy === s.id}
                            >
                              {s.status === "read"
                                ? "Marcar nueva"
                                : "Marcar leída"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section
              className="admin-panel"
              role="tabpanel"
              aria-label="Notificaciones"
            >
              <div className="admin-users-head">
                <div>
                  <h2 className="conn-h2">Notificaciones</h2>
                  <p className="conn-sub">
                    Resumen diario de usuarios nuevos por email.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadNotifications}
                  disabled={notifLoading}
                >
                  {notifLoading ? "Actualizando…" : "Actualizar"}
                </button>
              </div>

              {notifError && (
                <p className="auth-error conn-error">{notifError}</p>
              )}

              {!notif ? (
                <p className="conn-sub">Cargando…</p>
              ) : (
                <div className="notif-card">
                  <div className="notif-row">
                    <div>
                      <div className="notif-title">
                        Avisarme cuando se registre alguien
                      </div>
                      <div className="notif-sub">
                        Un mail por día a las 10:00 (ART), solo si hay usuarios
                        nuevos. Si no hay, no se manda nada.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={notif.enabled}
                      aria-label="Activar o desactivar las notificaciones"
                      className={`notif-switch${notif.enabled ? " on" : ""}`}
                      onClick={toggleNotifications}
                      disabled={notifBusy === "toggle"}
                    >
                      <span className="notif-knob" />
                    </button>
                  </div>

                  <div className="notif-stats">
                    <div className="notif-stat">
                      <span>Pendientes</span>
                      <b>{notif.pending}</b>
                    </div>
                    <div className="notif-stat">
                      <span>Último envío</span>
                      <b>
                        {notif.lastNotifiedAt
                          ? fmtDate(notif.lastNotifiedAt)
                          : "—"}
                      </b>
                    </div>
                    <div className="notif-stat">
                      <span>Email</span>
                      <b className={notif.emailConfigured ? "ok" : "off"}>
                        {notif.emailConfigured
                          ? "Configurado"
                          : "Falta API key"}
                      </b>
                    </div>
                    <div className="notif-stat">
                      <span>Frecuencia</span>
                      <b>10:00 ART</b>
                    </div>
                  </div>

                  <div className="notif-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={sendDigestNow}
                      disabled={notifBusy === "send" || !notif.emailConfigured}
                      title={
                        notif.emailConfigured
                          ? "Enviar el resumen ahora"
                          : "Configurá RESEND_API_KEY y NOTIFY_EMAIL_TO"
                      }
                    >
                      {notifBusy === "send"
                        ? "Enviando…"
                        : "Enviar resumen ahora"}
                    </button>
                    {!notif.emailConfigured && (
                      <p className="admin-warn">
                        Falta{" "}
                        <code className="admin-inline-code">RESEND_API_KEY</code>{" "}
                        o{" "}
                        <code className="admin-inline-code">NOTIFY_EMAIL_TO</code>{" "}
                        en el servidor.
                      </p>
                    )}
                  </div>

                  {notif.enabled === false && (
                    <p className="notif-off-note">
                      Está apagado: los usuarios nuevos quedan pendientes y
                      entran en el próximo resumen cuando lo vuelvas a prender.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {editing && (
        <div className="onb-overlay" onClick={closeEdit}>
          <div
            className="onb-card admin-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Editar usuario"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="onb-head">
              <div>
                <div className="onb-title">Editar usuario</div>
                <div className="onb-sub">
                  {editing.email || editing.username || "Sin email"}
                </div>
              </div>
              <button
                type="button"
                className="onb-x"
                onClick={closeEdit}
                aria-label="Cerrar"
                disabled={modalSaving}
              >
                ×
              </button>
            </div>
            <div className="onb-body">
              <div className="onb-grid">
                <label className="onb-field">
                  <span>Rol</span>
                  <select
                    value={editForm.role}
                    disabled={editing.role === "demo"}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, role: e.target.value }))
                    }
                  >
                    {options.roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] || r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="onb-field">
                  <span>Tier</span>
                  <select
                    value={editForm.tier}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, tier: e.target.value }))
                    }
                  >
                    {options.tiers.map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t] || t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="onb-field">
                  <span>Estado</span>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    {options.statuses.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s] || s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {editing.role === "demo" && (
                <p className="admin-modal-hint">
                  La cuenta demo es pública: su rol no se puede cambiar. Plan y
                  estado sí.
                </p>
              )}
              {modalError && <p className="auth-error">{modalError}</p>}
            </div>
            <div className="onb-foot">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeEdit}
                disabled={modalSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                onClick={saveEdit}
                disabled={modalSaving}
              >
                {modalSaving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="onb-overlay" onClick={closeDelete}>
          <div
            className="onb-card admin-modal confirm-card"
            role="dialog"
            aria-modal="true"
            aria-label="Eliminar usuario"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="onb-head">
              <div>
                <div className="onb-title">¿Eliminar usuario?</div>
                <div className="onb-sub">
                  {deleting.email || deleting.username || "Sin email"}
                </div>
              </div>
              <button
                type="button"
                className="onb-x"
                onClick={closeDelete}
                aria-label="Cerrar"
                disabled={modalSaving}
              >
                ×
              </button>
            </div>
            <div className="onb-body">
              <p className="admin-modal-text">
                Se borran la cuenta y todos sus registros (comidas, pesos y
                entrenamientos). Esta acción no se puede deshacer.
              </p>
              {deleteError && <p className="auth-error">{deleteError}</p>}
            </div>
            <div className="onb-foot">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeDelete}
                disabled={modalSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={modalSaving}
              >
                {modalSaving ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="conn-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
