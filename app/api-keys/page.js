"use client";

// /api-keys — gestión de API keys para agentes (paso 4 del plan de API).
//
// Es una página y no un modal porque los snippets de configuración son largos.
// Requiere sesión: la web pide la lista con el access token; el token crudo de
// una key nueva se muestra UNA sola vez y no se vuelve a pedir al servidor.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthContext";
import { getSupabase } from "../../lib/supabaseClient";
import { EXPIRY_OPTIONS, SCOPES, SCOPE_VALUES } from "../../lib/api/keys";

const EMPTY_FORM = {
  name: "",
  expiry: "90d",
  scopes: ["health:read", "meals:write"],
};

// Fechas cortas: "21 nov 2026". Se formatean en el cliente para no romper el
// render del servidor con zonas distintas.
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtAgo(iso) {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return fmtDate(iso);
}

function isExpired(iso) {
  return iso ? new Date(iso).getTime() < Date.now() : false;
}

// La API devuelve { error, code } (ver `apiError` en lib/api/log.js). Leer
// `message` acá mostraba siempre el texto genérico y escondía el motivo real
// (ej. "la cuenta demo no puede crear keys").
function apiMessage(body, fallback) {
  return body?.error || body?.message || fallback;
}

export default function ConnectionsPage() {
  const { user, ready, signOut } = useAuth();
  const router = useRouter();

  const [keys, setKeys] = useState([]);
  const [limits, setLimits] = useState(null);
  const [tier, setTier] = useState("free");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Código de error de la API. `demo_not_allowed` cambia la página entera: la
  // cuenta demo es pública y no puede tener keys, así que no tiene sentido
  // mostrarle el formulario.
  const [blockedCode, setBlockedCode] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Token recién creado: vive solo en memoria, nunca se relee del servidor.
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Aviso efímero. El botón de crear no se deshabilita al llegar al límite:
  // un botón deshabilitado no explica nada y parece roto. Al clickearlo avisa.
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
    setLoadError("");
    try {
      const t = await token();
      if (!t) throw new Error("sin sesión");
      const res = await fetch("/api/keys", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok) {
        setBlockedCode(body?.code || "");
        throw new Error(apiMessage(body, "No se pudieron cargar las keys."));
      }
      setBlockedCode("");
      setKeys(body.keys || []);
      setLimits(body.limits || null);
      setTier(body.tier || "free");
    } catch (err) {
      setLoadError(err.message || "No se pudieron cargar las keys.");
    } finally {
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const toggleScope = (value) => {
    // `health:read` es obligatorio: sin lectura el agente no puede confirmar
    // nada de lo que escribió.
    if (value === "health:read") return;
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(value)
        ? f.scopes.filter((s) => s !== value)
        : [...f.scopes, value].sort(
            (a, b) => SCOPE_VALUES.indexOf(a) - SCOPE_VALUES.indexOf(b)
          ),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError("");
    try {
      const t = await token();
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(apiMessage(body, "No se pudo crear la key."));
      setNewKey({ ...body.key, token: body.token });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      load();
    } catch (err) {
      setFormError(err.message || "No se pudo crear la key.");
    } finally {
      setCreating(false);
    }
  };

  // Revocar es definitivo: la key deja de autenticar para siempre y queda en la
  // lista como registro. El cupo del plan se libera igual, porque el límite del
  // tier cuenta solo las keys no revocadas.
  const revoke = async (key) => {
    setBusyId(key.id);
    setLoadError("");
    try {
      const t = await token();
      const res = await fetch(`/api/keys/${key.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(apiMessage(body, "No se pudo revocar la key."));
      setConfirmRevoke(null);
      load();
    } catch (err) {
      setLoadError(err.message || "No se pudo revocar la key.");
      setConfirmRevoke(null);
    } finally {
      setBusyId(null);
    }
  };

  // Eliminar sí borra: se va la key, su secreto y su contador de uso.
  const remove = async (key) => {
    setBusyId(key.id);
    setLoadError("");
    try {
      const t = await token();
      const res = await fetch(`/api/keys/${key.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(apiMessage(body, "No se pudo eliminar la key."));
      if (newKey?.id === key.id) setNewKey(null);
      setConfirmDelete(null);
      load();
    } catch (err) {
      setLoadError(err.message || "No se pudo eliminar la key.");
      setConfirmDelete(null);
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (text, tag) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  };

  const active = keys.filter((k) => !k.revoked_at && !isExpired(k.expires_at));
  const inactive = keys.filter((k) => k.revoked_at || isExpired(k.expires_at));
  const atLimit = Boolean(limits) && active.length >= limits.keys;
  const handle = user?.username || user?.displayName || "usuario";

  if (!ready || (loading && !keys.length)) {
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
            <div className="title">Health Dashboard</div>
            <div className="subtitle">API keys · API para agentes</div>
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
        Una API key es una contraseña para conectar con otro programa o AI. 
        Se pega en la configuración de un agente (Claude Code, OpenClaw, Hermes o cualquier cliente HTTP)
        y le permite leer y registrar tus datos sin pasar por la web. El token se muestra
        una sola vez: guardalo donde lo vayas a usar.
      </p>

      {/* El token crudo solo existe acá y hasta que se recargue la página. */}
      {newKey && (
        <div className="key-new card">
          <div className="key-new-head">
            <span className="key-new-title">Key creada: {newKey.name}</span>
            <button
              className="onb-x"
              onClick={() => setNewKey(null)}
              aria-label="Ocultar"
            >
              ×
            </button>
          </div>
          <p className="key-new-warn">
            Copiala ahora. No la vas a poder volver a ver: en la base solo guardamos su
            hash.
          </p>
          <div className="key-token">
            <code>{newKey.token}</code>
            <button
              className="btn btn-sm"
              onClick={() => copy(newKey.token, "token")}
            >
              {copied === "token" ? "Copiado" : "Copiar"}
            </button>
          </div>
          <div className="key-new-example">
            <div className="key-new-label">Probala ahora</div>
            <div className="key-token">
              <code>{`curl -H "Authorization: Bearer ${newKey.token}" "${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/ping?pretty=1"`}</code>
              <button
                className="btn btn-sm"
                onClick={() =>
                  copy(
                    `curl -H "Authorization: Bearer ${newKey.token}" "${window.location.origin}/api/v1/ping?pretty=1"`,
                    "curl"
                  )
                }
              >
                {copied === "curl" ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {blockedCode === "demo_not_allowed" ? (
        <div className="card conn-demo">
          <h2 className="conn-h2">La cuenta demo no puede crear API keys</h2>
          <p className="conn-sub">
            La demo es una cuenta pública. 
            Cree su propia cuenta para usar esta funcionalidad
          </p>
          <p className="conn-sub">
            Creá tu propia cuenta con Google o email y ahí sí vas a poder generar tu key
            con tus propios datos.
          </p>
          <Link href="/" className="btn">
            Crear mi cuenta
          </Link>
        </div>
      ) : (
        <>
          {loadError && <p className="auth-error conn-error">{loadError}</p>}

          <section className="card conn-section">
        <div className="conn-section-head">
          <div>
            <h2 className="conn-h2">Tus API keys</h2>
            <p className="conn-sub">
              {limits
                ? `${active.length} de ${limits.keys} activas · ${limits.requestsPerDay.toLocaleString("es-AR")} pedidos por día`
                : ""}
            </p>
            {atLimit && (
              <p className="conn-sub conn-limit-hint" id="key-limit-hint">
                Llegaste al límite del plan {tier}: revocá una key para crear otra.
              </p>
            )}
          </div>
          <button
            className={`btn${atLimit && !formOpen ? " btn-at-limit" : ""}`}
            onClick={() => {
              if (atLimit && !formOpen) {
                showToast(
                  `Límite del plan ${tier} alcanzado (${limits.keys} ${
                    limits.keys === 1 ? "key activa" : "keys activas"
                  }). Revocá una para crear otra.`
                );
                return;
              }
              setFormOpen((o) => !o);
              setFormError("");
            }}
            aria-describedby={atLimit ? "key-limit-hint" : undefined}
            title={atLimit ? "Límite del plan alcanzado" : "Crear una API key"}
          >
            {formOpen ? "Cancelar" : "+ Nueva key"}
          </button>
        </div>

        {formOpen && (
          <form className="key-form" onSubmit={submit}>
            <div className="onb-grid">
              <label className="onb-field">
                Nombre
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Claude Code en la notebook"
                  maxLength={60}
                  autoFocus
                  required
                />
              </label>
              <label className="onb-field">
                Vence en
                <select
                  value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="onb-label">Permisos</div>
            <div className="scope-list">
              {SCOPES.map((s) => {
                const locked = s.value === "health:read";
                const on = form.scopes.includes(s.value);
                return (
                  <button
                    type="button"
                    key={s.value}
                    className={`scope-item${on ? " active" : ""}${
                      locked ? " locked" : ""
                    }`}
                    onClick={() => toggleScope(s.value)}
                    aria-pressed={on}
                  >
                    <span className="scope-check">{on ? "✓" : ""}</span>
                    <span className="scope-text">
                      <b>{s.label}</b>
                      <span className="scope-hint">
                        {s.hint}
                        {locked ? " · siempre incluido" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {formError && <p className="auth-error onb-error">{formError}</p>}

            <div className="key-form-foot">
              <span className="muted">
                Los agentes no pueden borrar nada: eso se hace desde la web.
              </span>
              <button className="btn" type="submit" disabled={creating || !form.name.trim()}>
                {creating ? "Creando…" : "Crear key"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : keys.length === 0 ? (
          <p className="conn-empty">
            Todavía no tenés API keys. Creá una para conectar un agente.
          </p>
        ) : (
          <div className="key-list">
            {[...active, ...inactive].map((k) => {
              const dead = Boolean(k.revoked_at);
              const expired = !dead && isExpired(k.expires_at);
              return (
                <div className={`key-row${dead || expired ? " off" : ""}`} key={k.id}>
                  <div className="key-main">
                    <div className="key-name">
                      {k.name}
                      {dead && <span className="key-badge off">revocada</span>}
                      {expired && <span className="key-badge off">vencida</span>}
                    </div>
                    <div className="key-meta">
                      <code>{k.prefix}…</code>
                      <span className="key-dot">·</span>
                      vence {fmtDate(k.expires_at)}
                      <span className="key-dot">·</span>
                      último uso {fmtAgo(k.last_used_at)}
                    </div>
                    <div className="diet-tags key-scopes">
                      {k.scopes.map((s) => (
                        <span className="diet-tag" key={s}>
                          {SCOPES.find((x) => x.value === s)?.label || s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {confirmDelete === k.id ? (
                    <div className="key-actions">
                      <span className="key-confirm">¿Eliminar para siempre?</span>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => remove(k)}
                        disabled={busyId === k.id}
                      >
                        {busyId === k.id ? "…" : "Sí"}
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setConfirmDelete(null)}
                        disabled={busyId === k.id}
                      >
                        No
                      </button>
                    </div>
                  ) : confirmRevoke === k.id ? (
                    <div className="key-actions">
                      <span className="key-confirm">¿Revocar? No se puede deshacer</span>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => revoke(k)}
                        disabled={busyId === k.id}
                      >
                        {busyId === k.id ? "…" : "Sí"}
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setConfirmRevoke(null)}
                        disabled={busyId === k.id}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="key-actions">
                      {dead ? (
                        <span className="key-hint muted">
                          revocada {fmtDate(k.revoked_at)}: creá otra
                        </span>
                      ) : expired ? (
                        <span className="key-hint muted">vencida: creá otra</span>
                      ) : (
                        <button
                          className="profile-delete-link"
                          onClick={() => setConfirmRevoke(k.id)}
                        >
                          Revocar
                        </button>
                      )}
                      <button
                        className="profile-delete-link danger"
                        onClick={() => setConfirmDelete(k.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="conn-foot muted">
        <strong>Revocar</strong> desactiva la key al instante: deja de autenticar y
        libera su lugar en el plan, pero queda en la lista como registro. No se puede
        reactivar: si la necesitás de nuevo, creá otra.{" "}
        <strong>Eliminar</strong> la borra de verdad, junto con su contador de uso: de
        la key no queda nada.
      </p>
        </>
      )}

      {/* Aviso efímero: aparece al clickear "+ Nueva key" con el cupo lleno. */}
      {toast && (
        <div className="conn-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
