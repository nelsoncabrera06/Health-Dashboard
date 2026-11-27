"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../components/AuthContext";
import AuthModal from "../../components/AuthModal";
import {
  addMeal,
  deleteMeal,
  getMealsSince,
  getProfile,
  getRecentMeals,
  getRecentWeights,
  getTargets,
  getTodayMeals,
  getTodayWorkouts,
  groupNutrientByDay,
  sumMacros,
} from "../../lib/health";
import { MEAL_PLAN } from "../../lib/mealPlan";
import {
  addDemoMeal,
  deleteDemoMeal,
  isLocalId,
  mergeMeals,
  mergeWeights,
  readDemoMeals,
  readDemoWeights,
} from "../../lib/demoSandbox";
import ChatWidget from "../../components/ChatWidget";
import Onboarding from "../../components/Onboarding";
import ProfileModal from "../../components/ProfileModal";

function fmtEatenAt(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

const EMPTY_FORM = { meal: "", calories: "", protein: "", carbs: "", fat: "" };

// Las 4 tarjetas de macros son también el selector del gráfico grande: al
// tocar una, el gráfico de abajo muestra esa serie (default: calorías).
const METRICS = [
  {
    key: "calories",
    label: "Calorías",
    unit: "kcal",
    color: "var(--orange)",
    bar: "var(--blue)",
    targetLabel: "Límite",
    ceiling: true,
  },
  {
    key: "protein",
    label: "Proteína",
    unit: "g",
    color: "var(--blue)",
    targetLabel: "Objetivo",
    ceiling: false,
  },
  {
    key: "carbs",
    label: "Carbos",
    unit: "g",
    color: "var(--yellow)",
    targetLabel: "Objetivo",
    ceiling: false,
  },
  {
    key: "fat",
    label: "Grasas",
    unit: "g",
    color: "var(--teal)",
    targetLabel: "Límite",
    ceiling: true,
  },
];

function MacroCard({
  label,
  value,
  target,
  unit,
  color,
  type,
  info,
  active,
  onSelect,
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const v = Math.round(value || 0);
  const tgt = Math.round(target || 0);
  const pctReal = tgt > 0 ? Math.round((value / target) * 100) : 0;
  const pctBar = Math.min(100, Math.max(0, pctReal));
  const subUnit = unit === "" ? " kcal" : unit;

  let subText = "";
  let isOver = false;
  let isMet = false;

  if (!tgt || tgt <= 0) {
    subText = "Sin meta definida";
  } else if (type === "floor") {
    const diff = tgt - v;
    if (diff > 0) {
      subText = `faltan ${diff}${subUnit} · ${pctReal}%`;
    } else {
      isMet = true;
      const over = v - tgt;
      subText = `meta cumplida${over > 0 ? ` (+${over}${subUnit})` : ""} · ${pctReal}%`;
    }
  } else {
    const diff = tgt - v;
    if (diff >= 0) {
      subText = `quedan ${diff}${subUnit} · ${pctReal}%`;
    } else {
      isOver = true;
      const over = v - tgt;
      subText = `+${over}${subUnit} excedido · ${pctReal}%`;
    }
  }

  let barBg = color;
  if (type === "floor" && isMet) {
    barBg = "var(--green)";
  } else if (type !== "floor" && isOver) {
    barBg = "var(--red)";
  }

  return (
    <div
      className={`card macro-card${active ? " active" : ""}`}
      style={{ "--macro": color }}
      role="button"
      tabIndex={0}
      aria-pressed={Boolean(active)}
      title={active ? "Es el gráfico que estás viendo" : `Ver el gráfico de ${label}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
    >
      <div className="card-header-row">
        <div className="card-label">{label}</div>
        {info && (
          <div className="card-info-wrap">
            <button
              type="button"
              className="card-info-btn"
              aria-label={`Información sobre ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowTooltip((prev) => !prev);
              }}
              onBlur={() => {
                setTimeout(() => setShowTooltip(false), 250);
              }}
            >
              i
            </button>
            <div className={`card-tooltip${showTooltip ? " open" : ""}`}>
              <div className="card-tooltip-role" style={{ color }}>
                {info.role}
              </div>
              <div className="card-tooltip-desc">{info.desc}</div>
              <div className="card-tooltip-meta">
                Meta: <strong>{tgt}{subUnit}</strong> · Consumido: <strong>{v}{subUnit}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="card-value" style={{ color }}>
        {v}{unit}
      </div>
      <div className={`card-sub${isOver ? " over" : ""}${isMet ? " met" : ""}`}>
        {subText}
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${pctBar}%`, background: barBg }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, ready, signOut } = useAuth();
  // La demo es una cuenta compartida: sus registros no van a Supabase, van al
  // sandbox del navegador (lib/demoSandbox.js). El seed de la DB es de lectura.
  const isDemo = user?.role === "demo";
  const [modalOpen, setModalOpen] = useState(false);
  const [targets, setTargets] = useState(null);
  const [profile, setProfile] = useState(null);
  const [todayMeals, setTodayMeals] = useState([]);
  const [recent, setRecent] = useState([]);
  const [weekDays, setWeekDays] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [calMeals, setCalMeals] = useState([]);
  const [calWindow, setCalWindow] = useState(7);
  // Qué serie muestra el gráfico grande: se elige tocando una tarjeta de macro.
  const [metric, setMetric] = useState("calories");
  const [weights, setWeights] = useState([]);
  const [weightWindow, setWeightWindow] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Confirmación de borrado de una comida (no se puede deshacer).
  const [confirmMeal, setConfirmMeal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Onboarding: se abre solo la primera vez (perfil sin `onboarded_at`) y
  // después desde "Editar" en la ventana "Mis datos".
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const autoOnboarding = useRef(false);
  // Cómo se muestra el chat: "side" (achica el dashboard) o "overlay" (encima).
  const [chatMode, setChatMode] = useState("side");
  const menuRef = useRef(null);
  const router = useRouter();

  // Preferencia de UI: se lee después de montar porque `localStorage` no existe
  // en el servidor (rompería el render inicial).
  useEffect(() => {
    const saved = localStorage.getItem("chatMode");
    if (saved === "side" || saved === "overlay") setChatMode(saved);
  }, []);

  const changeChatMode = (mode) => {
    setChatMode(mode);
    try {
      localStorage.setItem("chatMode", mode);
    } catch {
      // Modo incógnito o storage lleno: la preferencia vive solo en memoria.
    }
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError("");
    try {
      const [t, prof, today, rec, todayW, weekMeals, wts] = await Promise.all([
        getTargets(user.id),
        getProfile(user.id).catch(() => null),
        getTodayMeals(user.id),
        getRecentMeals(user.id, 8),
        getTodayWorkouts(user.id).catch(() => []),
        getMealsSince(user.id, 90).catch(() => []),
        getRecentWeights(user.id, 365).catch(() => []),
      ]);
      setTargets(t);
      setProfile(prof);
      // Demo: lo que el visitante registra vive en sessionStorage. Se mergea
      // con el seed para que el dashboard lo muestre sin tocar la DB.
      if (user.role === "demo") {
        const localMeals = readDemoMeals();
        const localWeights = readDemoWeights();
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        setTodayMeals(
          mergeMeals(
            today,
            localMeals.filter((m) => new Date(m.eaten_at) >= dayStart)
          )
        );
        setRecent(mergeMeals(rec, localMeals).slice(0, 8));
        setCalMeals(mergeMeals(weekMeals, localMeals));
        setWeights(mergeWeights(wts, localWeights));
      } else {
        setTodayMeals(today);
        setRecent(rec);
        setCalMeals(weekMeals);
        setWeights(wts);
      }
      setWorkouts(todayW);
    } catch (e) {
      setLoadError(e.message || "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Otro usuario (logout/login en la misma pestaña): se resetea el wizard.
  useEffect(() => {
    autoOnboarding.current = false;
    setOnboardingOpen(false);
  }, [user?.id]);

  // Primera vez: sin `onboarded_at`. "Saltar por ahora" no vuelve a abrirlo
  // hasta el próximo login (el ref se resetea al cambiar de usuario).
  useEffect(() => {
    if (autoOnboarding.current || loading || !profile) return;
    if (!profile.onboarded_at) {
      autoOnboarding.current = true;
      setOnboardingOpen(true);
    }
  }, [loading, profile]);

  useEffect(() => {
    setWeekDays(groupNutrientByDay(calMeals, calWindow, metric));
  }, [calMeals, calWindow, metric]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.meal.trim()) {
      setFormError("Poné qué comiste.");
      return;
    }
    setSaving(true);
    try {
      // Demo: no escribe en la DB compartida, va al sandbox de la pestaña.
      if (isDemo) addDemoMeal(form);
      else await addMeal(user.id, form);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      if (isDemo) deleteDemoMeal(id);
      else await deleteMeal(user.id, id);
      await load();
    } catch (e) {
      setFormError(e.message || "No se pudo borrar.");
    }
  };

  // Borrar una comida no se deshace: primero se confirma en una caja chica.
  useEffect(() => {
    if (!confirmMeal) return;
    const esc = (e) => {
      if (e.key === "Escape" && !deleting) setConfirmMeal(null);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [confirmMeal, deleting]);

  const confirmDelete = async () => {
    if (!confirmMeal) return;
    setDeleting(true);
    try {
      await handleDelete(confirmMeal.id);
      setConfirmMeal(null);
    } finally {
      setDeleting(false);
    }
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

  const totals = sumMacros(todayMeals);

  // Valores derivados de las dos tarjetas grandes (calorías y peso).
  const calTarget = Math.round(
    targets?.[metric] || (metric === "calories" ? 2400 : 0)
  );
  const tdeeValue = profile?.tdee || 2910;
  const goalWeight = profile?.goal_weight_kg
    ? Number(profile.goal_weight_kg)
    : null;
  const burnedCalories = workouts.reduce(
    (s, w) => s + (Number(w.calories_burned) || 0),
    0
  );
  const netCalories = totals.calories - burnedCalories;

  const activeMetric =
    METRICS.find((m) => m.key === metric) || METRICS[0];
  const calWithData = weekDays.filter((d) => d.value > 0);
  const calAvg = calWithData.length
    ? Math.round(
        calWithData.reduce((s, d) => s + d.value, 0) / calWithData.length
      )
    : 0;
  const calOverDays = weekDays.filter((d) => d.value > calTarget).length;

  // Cambio dentro de la ventana elegida (el gráfico usa la misma).
  const winStart = new Date();
  winStart.setHours(0, 0, 0, 0);
  winStart.setDate(winStart.getDate() - (weightWindow - 1));
  const winWeights = weights.filter(
    (w) => new Date(`${w.measured_at}T12:00:00`) >= winStart
  );
  const weightDelta =
    winWeights.length >= 2
      ? Number(winWeights[0].weight_kg) -
        Number(winWeights[winWeights.length - 1].weight_kg)
      : null;
  const goalDistance =
    goalWeight != null && weights.length
      ? Math.abs(Number(weights[0].weight_kg) - goalWeight).toFixed(1)
      : null;

  return (
    <main className="dash">
      <div className="header">
        <Link
          className="header-left"
          href="/"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="3" y="19" width="5" height="9" rx="1.5" fill="#3b82f6" />
              <rect x="10.5" y="12" width="5" height="16" rx="1.5" fill="#22c55e" />
              <rect x="18" y="16" width="5" height="12" rx="1.5" fill="#a855f7" />
              <rect x="25.5" y="7" width="5" height="21" rx="1.5" fill="#14b8a6" />
            </svg>
          </span>
          <div>
            <div className="title">Nutrition Dashboard</div>
            <div className="subtitle">
              {user.displayName || user.username} · plan {user.tier}
            </div>
          </div>
        </Link>
        <div className="header-right">
          <div className="user-menu-wrap" ref={menuRef}>
            <button
              className="btn btn-secondary"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {profile?.display_name || user.displayName || user.username}
            </button>
            {menuOpen && (
              <div className="user-menu">
                <button
                  onClick={() => {
                    setProfileOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  Mis datos
                </button>
                <Link href="/api-keys">API keys</Link>
                <Link href="/suggestions">Sugerencias</Link>
                {user?.role === "admin" && <Link href="/admin">Admin</Link>}
                <div className="user-menu-sep" />
                <div className="menu-label">Chat</div>
                <div className="seg" role="group" aria-label="Cómo se muestra el chat">
                  <button
                    className={chatMode === "side" ? "active" : ""}
                    onClick={() => changeChatMode("side")}
                    title="El chat abre de costado y achica el dashboard"
                  >
                    ↔ De costado
                  </button>
                  <button
                    className={chatMode === "overlay" ? "active" : ""}
                    onClick={() => changeChatMode("overlay")}
                    title="El chat abre encima del dashboard"
                  >
                    ▣ Encima
                  </button>
                </div>
                <div className="user-menu-sep" />
                <button className="danger" onClick={handleSignOut}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isDemo && (
        <div className="demo-banner">
          <b>Estás en la demo.</b> Lo que registres se borra al cerrar sesión. Los datos de ejemplo no se modifican.
        </div>
      )}

      {loadError && (
        <div className="card">
          <p className="auth-error">{loadError}</p>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          className="btn btn-secondary"
          onClick={() => setFormOpen((o) => !o)}
        >
          {formOpen ? "Cerrar registro" : "+ Registrar comida"}
        </button>
      </div>

      {formOpen && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Registrar comida</div>
          <form className="meal-form" onSubmit={handleAdd}>
            <label className="meal-field meal-field-wide">
              Qué comiste
              <input
                value={form.meal}
                onChange={set("meal")}
                placeholder="Ej: Pollo con arroz"
                maxLength={120}
              />
            </label>
            <label className="meal-field">
              Kcal
              <input
                value={form.calories}
                onChange={set("calories")}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
            <label className="meal-field">
              Prot (g)
              <input
                value={form.protein}
                onChange={set("protein")}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
            <label className="meal-field">
              Carbos (g)
              <input
                value={form.carbs}
                onChange={set("carbs")}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
            <label className="meal-field">
              Grasa (g)
              <input
                value={form.fat}
                onChange={set("fat")}
                placeholder="0"
                inputMode="decimal"
              />
            </label>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </form>
          {formError && <p className="auth-error">{formError}</p>}
        </div>
      )}

      <div className="grid-macro">
        {loading || !targets ? (
          <div className="card">
            <p className="muted">Cargando…</p>
          </div>
        ) : (
          <>
            <MacroCard
              label="Calorías"
              metric="calories"
              active={metric === "calories"}
              onSelect={() => setMetric("calories")}
              value={totals.calories}
              target={targets.calories}
              unit=""
              color="var(--orange)"
              type="ceiling"
              info={{
                role: "Techo diario (Límite)",
                desc: "Presupuesto de energía total para mantener tu déficit. Procura no superarlo.",
              }}
            />
            <MacroCard
              label="Proteína"
              metric="protein"
              active={metric === "protein"}
              onSelect={() => setMetric("protein")}
              value={totals.protein}
              target={targets.protein}
              unit="g"
              color="var(--blue)"
              type="floor"
              info={{
                role: "Piso diario (Mínimo)",
                desc: "Objetivo a alcanzar o superar. Clave para retener masa muscular y dar saciedad.",
              }}
            />
            <MacroCard
              label="Carbos"
              metric="carbs"
              active={metric === "carbs"}
              onSelect={() => setMetric("carbs")}
              value={totals.carbs}
              target={targets.carbs}
              unit="g"
              color="var(--yellow)"
              type="budget"
              info={{
                role: "Presupuesto diario",
                desc: "Combustible principal para energía y rendimiento. Presupuesto flexible.",
              }}
            />
            <MacroCard
              label="Grasas"
              metric="fat"
              active={metric === "fat"}
              onSelect={() => setMetric("fat")}
              value={totals.fat}
              target={targets.fat}
              unit="g"
              color="var(--teal)"
              type="ceiling"
              info={{
                role: "Techo diario (Límite)",
                desc: "Esenciales para salud hormonal, pero con 9 kcal/g. Evita excederlo para no disparar las calorías.",
              }}
            />
          </>
        )}
      </div>

      {!loading && !!targets && (
        <p className="macro-hint">
          Tocá una tarjeta para ver esa serie en el gráfico de abajo.
        </p>
      )}

      <section className="card chart-card">
        <header className="card-head">
          <div>
            <h2 className="card-title">
              <span
                className="title-dot"
                style={{ background: activeMetric.color }}
                aria-hidden="true"
              />
              {activeMetric.label}
            </h2>
            <p className="card-subline">
              {calWindow === 7 ? "Últimos 7 días" : `Últimos ${calWindow} días`}
              {calAvg > 0
                ? ` · promedio ${calAvg.toLocaleString("es-AR")} ${
                    activeMetric.unit === "g" ? "g" : "kcal"
                  }`
                : ""}
              {calOverDays > 0
                ? ` · ${calOverDays} ${calOverDays === 1 ? "día" : "días"} ${
                    activeMetric.ceiling ? "sobre el límite" : "sobre el objetivo"
                  }`
                : ""}
            </p>
          </div>
          <div className="window-switch" role="group" aria-label="Período del gráfico">
            {[
              [7, "7D"],
              [14, "2S"],
              [30, "1M"],
              [90, "3M"],
            ].map(([days, label]) => (
              <button
                key={label}
                className={calWindow === days ? "active" : ""}
                onClick={() => setCalWindow(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="chart-legend">
          <span className="legend-item">
            <i
              className="lg-bar"
              style={{ background: activeMetric.bar || activeMetric.color }}
            />{" "}
            Consumido
          </span>
          {activeMetric.ceiling && (
            <span className="legend-item">
              <i className="lg-bar over" /> Sobre el límite
            </span>
          )}
          <span className="legend-item">
            <i className="lg-line goal" /> {activeMetric.targetLabel}{" "}
            {calTarget}
            {activeMetric.unit === "g" ? " g" : " kcal"}
          </span>
          {metric === "calories" && (
            <span className="legend-item">
              <i className="lg-line tdee" /> TDEE {tdeeValue}
            </span>
          )}
        </div>

        {loading && <p className="muted">Cargando…</p>}
        {!loading && !weekDays.length && (
          <div className="empty-state">Sin datos</div>
        )}
        {!loading && !!weekDays.length && (
          <MetricChart
            days={weekDays}
            target={calTarget}
            tdee={metric === "calories" ? tdeeValue : null}
            windowDays={calWindow}
            unit={activeMetric.unit}
            color={activeMetric.bar || activeMetric.color}
            overColor={activeMetric.ceiling ? "var(--red)" : null}
            targetLabel={activeMetric.targetLabel}
          />
        )}
      </section>

      <section className="card chart-card">
        <header className="card-head">
          <div>
            <h2 className="card-title">Progreso de peso</h2>
            <p className="card-subline">
              {weights.length
                ? `Último registro ${new Date(
                    weights[0].measured_at + "T12:00:00"
                  ).toLocaleDateString("es", {
                    day: "numeric",
                    month: "short",
                  })}`
                : "Sin registros"}
              {goalWeight ? ` · meta ${goalWeight} kg` : ""}
            </p>
          </div>
          <div className="window-switch" role="group" aria-label="Período de peso">
            {[
              [14, "2S"],
              [30, "1M"],
              [90, "3M"],
              [180, "6M"],
              [365, "1A"],
            ].map(([days, label]) => (
              <button
                key={label}
                className={weightWindow === days ? "active" : ""}
                onClick={() => setWeightWindow(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {loading && <p className="muted">Cargando…</p>}
        {!loading && !weights.length && (
          <div className="empty-state">Sin registros de peso</div>
        )}
        {!loading && !!weights.length && (
          <>
            <div className="kpi-row">
              <div className="kpi-main">
                <span className="kpi-value">{weights[0].weight_kg}</span>
                <span className="kpi-unit">kg</span>
              </div>
              {weightDelta != null && (
                <span
                  className={`kpi-delta${
                    weightDelta < 0 ? " down" : weightDelta > 0 ? " up" : ""
                  }`}
                >
                  {weightDelta > 0 ? "+" : "−"}
                  {Math.abs(weightDelta).toFixed(1)} kg
                  <span>en {weightWindow} días</span>
                </span>
              )}
              {goalDistance != null && (
                <span className="kpi-goal">
                  Faltan <b>{goalDistance} kg</b> para la meta
                </span>
              )}
            </div>
            <WeightChart
              weights={weights}
              goal={goalWeight}
              windowDays={weightWindow}
            />
          </>
        )}
      </section>

      <div className="grid-bottom">
        <div className="card">
          <h2 className="card-title">Últimas comidas</h2>
          {loading && <p className="muted">Cargando…</p>}
          {!loading && !recent.length && (
            <div className="empty-state">Sin comidas registradas</div>
          )}
          {!loading &&
            recent.map((m) => (
              <div className="meal-row" key={m.id}>
                <div className="meal-time">{fmtEatenAt(m.eaten_at)}</div>
                <div className="meal-name">{m.meal}</div>
                <div className="meal-cal">{Math.round(m.calories)} kcal</div>
                {(!isDemo || isLocalId(m.id)) && (
                  <button
                    className="meal-del"
                    onClick={() => setConfirmMeal(m)}
                    title="Eliminar esta comida"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
        </div>

        <div className="card">
          <h2 className="card-title">Ejercicio de hoy</h2>
          {loading && <p className="muted">Cargando…</p>}
          {!loading && !workouts.length && (
            <div className="empty-state">Sin entrenamientos hoy</div>
          )}
          {!loading &&
            workouts.map((w) => (
              <div className="meal-row" key={w.id}>
                <div className="meal-name">
                  {w.type}
                  <div className="meal-meta">
                    {w.duration_min} min
                    {w.notes ? ` · ${w.notes}` : ""}
                  </div>
                </div>
                <div className="meal-cal">
                  −{Math.round(w.calories_burned)} kcal
                </div>
              </div>
            ))}
          {!loading && !!workouts.length && targets && (
            <div className="net-box">
              <div>
                <div className="net-label">Balance neto del día</div>
                <div className="net-big">{Math.round(netCalories)} kcal</div>
              </div>
              <div className="net-breakdown">
                <span>
                  <b>{Math.round(totals.calories)}</b> consumidas
                </span>
                <span>
                  <b>{Math.round(burnedCalories)}</b> quemadas
                </span>
                <span>
                  <b>{targets.calories}</b> objetivo
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <MealPlan />
      <ChatWidget
        targets={targets}
        userId={user?.id}
        isDemo={isDemo}
        diets={profile?.diet_tags}
        country={profile?.country}
        goal={profile?.goal_type}
        supplements={profile?.supplements}
        supplementsOther={profile?.supplements_other}
        onSaved={load}
        mode={chatMode}
      />
      <Onboarding
        open={onboardingOpen}
        profile={profile}
        currentWeight={weights[0]?.weight_kg}
        onClose={() => setOnboardingOpen(false)}
        onSaved={load}
      />
      <ProfileModal
        open={profileOpen}
        profile={profile}
        currentWeight={weights[0]?.weight_kg}
        userId={user?.id}
        onClose={() => setProfileOpen(false)}
        onEdit={() => {
          setProfileOpen(false);
          setOnboardingOpen(true);
        }}
      />

      {/* Confirmación de borrado: caja chica, no un modal grande. */}
      {confirmMeal && (
        <div
          className="onb-overlay"
          onClick={() => !deleting && setConfirmMeal(null)}
        >
          <div
            className="onb-card confirm-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-del-title"
          >
            <div className="onb-head">
              <div>
                <div className="onb-title" id="confirm-del-title">
                  ¿Eliminar esta comida?
                </div>
                <div className="onb-sub">No se puede deshacer.</div>
              </div>
              <button
                className="onb-x"
                onClick={() => !deleting && setConfirmMeal(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="confirm-body">
              <div className="confirm-row">
                <span>Fecha</span>
                <b>{fmtEatenAt(confirmMeal.eaten_at)}</b>
              </div>
              <div className="confirm-row">
                <span>Comida</span>
                <b>{confirmMeal.meal}</b>
              </div>
              <div className="confirm-row">
                <span>Calorías</span>
                <b>{Math.round(confirmMeal.calories)} kcal</b>
              </div>
            </div>

            <div className="confirm-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmMeal(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MealPlan() {
  const p = MEAL_PLAN;
  const meals = [
    ["Desayuno", p.weekdays.desayuno],
    ["Almuerzo", p.weekdays.almuerzo],
    ["Pre/Post Gym", p.weekdays.pre_gym],
    ["Cena", p.weekdays.cena],
  ];
  const head = {
    fontSize: 13,
    fontWeight: 650,
    color: "var(--text)",
    marginBottom: 12,
  };
  return (
    <div style={{ marginTop: 20 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={head}>Plan semanal · lunes a viernes</div>
        <div>
          {meals.map(([label, m]) => (
            <div
              key={label}
              style={{
                marginBottom: 10,
                paddingBottom: 10,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--teal)",
                }}
              >
                {label}{" "}
                <span style={{ color: "var(--orange)", fontSize: 12 }}>
                  {m.kcal} kcal
                </span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{m.desc}</div>
              <div
                style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
              >
                {m.note}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={head}>Fines de semana</div>
        <div style={{ fontSize: 12 }}>{p.weekends.note}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          {p.weekends.tip}
        </div>
        <div style={{ fontSize: 12, color: "#34d399", marginTop: 4 }}>
          Target: {p.weekends.target_kcal}
        </div>
      </div>
      <div className="card">
        <div style={head}>Tips</div>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--muted)",
            marginBottom: 8,
            marginTop: 4,
          }}
        >
          Tips generales
        </div>
        {Object.entries(p.tips || {}).map(([k, v]) => (
          <div
            key={k}
            style={{
              marginBottom: 8,
              padding: 8,
              background: "var(--card2)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--blue)", fontWeight: 600 }}>
              {k.replace(/_/g, " ")}:
            </span>{" "}
            {v}
          </div>
        ))}
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--muted)",
            marginBottom: 8,
            marginTop: 12,
          }}
        >
          Tus hábitos
        </div>
        {Object.entries(p.habitos || {}).map(([k, v]) => (
          <div
            key={k}
            style={{
              marginBottom: 8,
              padding: 8,
              background: "var(--card2)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {k.replace(/_/g, " ")}
            </div>
            <div style={{ color: "var(--muted)" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeightChart({ weights, goal, windowDays }) {
  const wrapRef = useRef(null);
  const [cw, setCw] = useState(640);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((es) =>
      setCw(Math.max(320, Math.round(es[0].contentRect.width)))
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const byDate = {};
  (weights || []).forEach((w) => {
    byDate[w.measured_at] = Number(w.weight_kg);
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slots = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    slots.push({ iso, date: d, value: byDate[iso] ?? null });
  }
  const valids = slots.filter((s) => s.value != null);
  if (!valids.length)
    return <div className="empty-state">Sin datos en este período</div>;

  const vals = valids.map((s) => s.value);
  const lo = Math.floor(Math.min(...vals, goal ?? Infinity) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const span = hi - lo || 1;

  const W = cw,
    H = 250,
    P = { l: 46, r: 14, t: 16, b: 30 };
  const X = (i) =>
    P.l + (i / Math.max(slots.length - 1, 1)) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);

  // Ticks Y con paso lindo (1/2/5 × 10^n), pocos para no ensuciar.
  const rawStep = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const yStep = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const yTicks = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-9; v += yStep)
    yTicks.push(Math.round(v * 100) / 100);

  // Ticks X: menos en pantallas angostas.
  const m = Math.min(cw < 520 ? 4 : 7, slots.length);
  const xIdx = [
    ...new Set(
      Array.from({ length: m }, (_, k) =>
        Math.round((k * (slots.length - 1)) / (m - 1))
      )
    ),
  ];

  const pts = valids.map((s) => ({
    x: X(slots.indexOf(s)),
    y: Y(s.value),
    ...s,
  }));
  const line =
    pts.length > 1
      ? pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
      : "";
  const area =
    pts.length > 1
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${Y(lo).toFixed(1)} L${pts[0].x.toFixed(1)},${Y(lo).toFixed(1)} Z`
      : "";
  return (
    <>
      <div ref={wrapRef}>
      <svg className="wchart" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={Y(v)}
              y2={Y(v)}
              stroke="rgba(255,255,255,.06)"
            />
            <text
              x={P.l - 8}
              y={Y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize="10"
              fill="#64748b"
            >
              {v}
            </text>
          </g>
        ))}
        {xIdx.map((i) => (
          <text
            key={slots[i].iso}
            x={X(i)}
            y={H - P.b + 18}
            textAnchor="middle"
            fontSize="9.5"
            fill="#64748b"
          >
            {slots[i].date.toLocaleDateString("es", {
              day: "numeric",
              month: "short",
            })}
          </text>
        ))}
        {goal != null && (
          <g>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={Y(goal)}
              y2={Y(goal)}
              stroke="#34d399"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
            <text
              x={W - P.r}
              y={Y(goal) - 6}
              textAnchor="end"
              fontSize="10"
              fontWeight="700"
              fill="#34d399"
            >
              Meta {goal} kg
            </text>
          </g>
        )}
        {area && <path d={area} fill="url(#wfill)" />}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {pts.map((p) => (
          <circle
            key={p.iso}
            cx={p.x}
            cy={p.y}
            r={pts.length > 40 ? 2.2 : 3.4}
            fill="#3b82f6"
            stroke="var(--card)"
            strokeWidth="1"
          >
            <title>
              {p.date.toLocaleDateString("es", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              : {p.value} kg
            </title>
          </circle>
        ))}
      </svg>
      </div>
    </>
  );
}

function MetricChart({
  days,
  target,
  tdee,
  windowDays,
  unit,
  color,
  overColor,
  targetLabel,
}) {
  const wrapRef = useRef(null);
  const [cw, setCw] = useState(900);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((es) =>
      setCw(Math.max(260, Math.round(es[0].contentRect.width)))
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  // En celular no entran 7 etiquetas de fecha ni el valor sobre cada barra.
  const compact = cw < 560;
  const vals = days.map((d) => d.value);
  const maxVal = Math.max(...vals, 0);
  // Calorías: el techo de la escala lo marcan el límite y el TDEE (así las
  // líneas entran en el gráfico). Macros: objetivo × 1.3 o el día más alto.
  const max = Math.max(
    target * (tdee ? 1.15 : 1.3),
    tdee ? tdee * 1.05 : 0,
    maxVal * 1.05,
    unit === "g" ? 10 : 100
  );
  const fmtTick = (v) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  const step = compact
    ? Math.max(1, Math.ceil(days.length / 4))
    : windowDays >= 90
    ? 7
    : days.length > 14
    ? Math.ceil(days.length / 10)
    : 1;
  const gap = days.length > 30 ? 2 : days.length > 14 ? 3 : 6;
  const barMax = days.length <= 14 ? 56 : days.length <= 30 ? 22 : 10;

  // Divisiones del eje y: kcal en múltiplos de 500/1000; gramos con un paso
  // "lindo" (5/10/20/25/50…) para que no aparezcan 37,5 g.
  let yStep;
  if (unit !== "g") {
    yStep = max > 4200 ? 1000 : 500;
  } else {
    const raw = max / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const norm = raw / pow;
    const mult =
      norm < 1.5 ? 1 : norm < 2.25 ? 2 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
    yStep = Math.max(5, mult * pow);
  }
  const yTicks = [];
  for (let v = 0; v <= max; v += yStep) yTicks.push(v);
  // Sin TDEE (macros) la línea es la meta: verde, igual que la "Meta" del peso.
  const goal = tdee == null;

  return (
    <div className="vchart" ref={wrapRef}>
      <div className="voverlay">
        {yTicks.map((v) => (
          <div key={v} className="vgrid" style={{ bottom: `${(v / max) * 100}%` }}>
            <span>{fmtTick(v)}</span>
          </div>
        ))}
        {/* Líneas de referencia: mismo trazo SVG que la "Meta" del gráfico de
            peso (`strokeWidth 2`, `dasharray 6 5`). En porcentajes del alto del
            área para no depender de medir en px. */}
        <svg className="vlines" aria-hidden="true">
          {tdee != null && (
            <line
              className="tdee"
              x1="0"
              x2="100%"
              y1={`${100 - (tdee / max) * 100}%`}
              y2={`${100 - (tdee / max) * 100}%`}
            />
          )}
          <line
            className={goal ? "goal" : "limit"}
            x1="0"
            x2="100%"
            y1={`${100 - (target / max) * 100}%`}
            y2={`${100 - (target / max) * 100}%`}
          />
        </svg>
        {/* Las etiquetas van SIEMPRE arriba de su línea (si una va abajo se
            cruza con la otra). El área deja 16px de aire arriba para que la de
            arriba no se salga. Las dos, a la derecha y sin fondo. */}
        {!compact && (
          <>
            {tdee != null && (
              <div
                className="vline-label tdee"
                style={{ bottom: `calc(${(tdee / max) * 100}% + 7px)` }}
              >
                TDEE {tdee}
              </div>
            )}
            <div
              className={`vline-label${goal ? " goal" : ""}`}
              style={{ bottom: `calc(${(target / max) * 100}% + 7px)` }}
            >
              {targetLabel} {target}
              {unit === "g" ? " g" : ""}
            </div>
          </>
        )}
      </div>
      <div className="vcols" style={{ gap }}>
        {days.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100);
          const isToday = i === days.length - 1;
          const date = new Date(d.key);
          const full = date.toLocaleDateString("es", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const label =
            windowDays > 14
              ? date.toLocaleDateString("es", { day: "numeric", month: "short" })
              : d.label;
          const dateStr = date.toLocaleDateString("es", {
            day: "numeric",
            month: "short",
          });
          return (
            <div
              key={d.key}
              className={`vcol${isToday ? " vtoday" : ""}`}
              title={`${full}: ${d.value}${unit === "g" ? " g" : " kcal"}`}
            >
              <div className="vval">
                {!compact && windowDays <= 14 && d.value > 0
                  ? d.value.toLocaleString("es-AR")
                  : ""}
              </div>
              <div className="vbarwrap">
                <div
                  className="vbar"
                  style={{
                    height: `${h}%`,
                    maxWidth: barMax,
                    background:
                      overColor && d.value > target ? overColor : color,
                  }}
                />
              </div>
              <div className="vday">
                {(i % step === 0 || isToday) &&
                  (windowDays > 14 || compact ? label : (
                    <>
                      <span>{d.label}</span>
                      <span className="vday-date">{dateStr}</span>
                    </>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
