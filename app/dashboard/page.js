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
  groupCaloriesByDay,
  sumMacros,
} from "../../lib/health";
import { MEAL_PLAN } from "../../lib/mealPlan";

function pct(val, target) {
  return target > 0 ? Math.min(100, Math.round((val / target) * 100)) : 0;
}

function barColor(p) {
  if (p < 50) return "var(--red)";
  if (p < 85) return "var(--yellow)";
  if (p <= 105) return "var(--green)";
  return "var(--red)";
}

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

function MacroCard({ label, value, target, unit, color }) {
  const p = pct(value, target);
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value" style={{ color }}>
        {Math.round(value)}
        {unit}
      </div>
      <div className="card-sub">
        de {target}
        {unit} · {p}%
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${p}%`, background: barColor(p) }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, ready, signOut } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [targets, setTargets] = useState(null);
  const [profile, setProfile] = useState(null);
  const [todayMeals, setTodayMeals] = useState([]);
  const [recent, setRecent] = useState([]);
  const [weekDays, setWeekDays] = useState([]);
  const [calMeals, setCalMeals] = useState([]);
  const [calWindow, setCalWindow] = useState(7);
  const [weights, setWeights] = useState([]);
  const [weightWindow, setWeightWindow] = useState(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const router = useRouter();

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError("");
    try {
      const [t, prof, today, rec, weekMeals, wts] = await Promise.all([
        getTargets(user.id),
        getProfile(user.id).catch(() => null),
        getTodayMeals(user.id),
        getRecentMeals(user.id, 8),
        getMealsSince(user.id, 90).catch(() => []),
        getRecentWeights(user.id, 365).catch(() => []),
      ]);
      setTargets(t);
      setProfile(prof);
      setTodayMeals(today);
      setRecent(rec);
      setCalMeals(weekMeals);
      setWeights(wts);
    } catch (e) {
      setLoadError(e.message || "No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setWeekDays(groupCaloriesByDay(calMeals, calWindow));
  }, [calMeals, calWindow]);

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
      await addMeal(user.id, form);
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
      await deleteMeal(user.id, id);
      await load();
    } catch (e) {
      setFormError(e.message || "No se pudo borrar.");
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

  return (
    <main className="dash">
      <div className="header">
        <div className="header-left">
          <div className="logo">🏋️</div>
          <div>
            <div className="title">Health Dashboard</div>
            <div className="subtitle">
              {user.displayName || user.username} · plan {user.tier}
            </div>
          </div>
        </div>
        <div className="header-right">
          <Link className="btn btn-secondary" href="/">
            ← Inicio
          </Link>
          <button className="btn btn-secondary" onClick={handleSignOut}>
            Salir
          </button>
        </div>
      </div>

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
          {formOpen ? "▾ Cerrar registro" : "➕ Registrar comida"}
        </button>
      </div>

      {formOpen && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">➕ Registrar comida</div>
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
              label="🔥 Calorías"
              value={totals.calories}
              target={targets.calories}
              unit=""
              color="var(--orange)"
            />
            <MacroCard
              label="💪 Proteína"
              value={totals.protein}
              target={targets.protein}
              unit="g"
              color="var(--blue)"
            />
            <MacroCard
              label="🍞 Carbos"
              value={totals.carbs}
              target={targets.carbs}
              unit="g"
              color="var(--yellow)"
            />
            <MacroCard
              label="🥑 Grasas"
              value={totals.fat}
              target={targets.fat}
              unit="g"
              color="var(--teal)"
            />
          </>
        )}
      </div>

      <div className="grid-bottom">
        <div className="card">
          <div className="section-title">🍽️ Últimas comidas registradas</div>
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
                <button
                  className="meal-del"
                  onClick={() => handleDelete(m.id)}
                  title="Borrar"
                >
                  ×
                </button>
              </div>
            ))}
        </div>

        {profile && (
          <div className="card">
            <div className="section-title">
              👤 Perfil — {profile.display_name || profile.username || ""}
            </div>
          <div className="stat-grid">
            {profile.height_cm && (
              <Stat label="Altura" value={`${profile.height_cm} cm`} />
            )}
            {weights[0] && (
              <Stat label="Peso actual" value={`${weights[0].weight_kg} kg`} />
            )}
            {profile.goal_weight_kg && (
              <Stat
                label="Objetivo"
                value={`${profile.goal_weight_kg} kg`}
                color="var(--green)"
              />
            )}
            {weights[0] && profile.goal_weight_kg && (
              <Stat
                label="Por bajar"
                value={`${(
                  Number(weights[0].weight_kg) - Number(profile.goal_weight_kg)
                ).toFixed(0)} kg`}
                color="var(--yellow)"
              />
            )}
            {profile.tdee && <Stat label="TDEE" value={`${profile.tdee} kcal`} />}
            {profile.calories_target && (
              <Stat
                label="Límite p/ meta"
                value={`${profile.calories_target} kcal`}
                color="var(--yellow)"
              />
            )}
            {profile.tdee && profile.calories_target && (
              <Stat
                label="Déficit diario"
                value={`${profile.tdee - profile.calories_target} kcal`}
                color="var(--red)"
              />
            )}
            {profile.activity && (
              <Stat label="Actividad" value={profile.activity} />
            )}
          </div>
        </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cal-head">
          <div className="section-title" style={{ margin: 0 }}>
            📅 Calorías
          </div>
          <div className="pills" style={{ margin: 0 }}>
            {[
              [7, "7D"],
              [14, "2S"],
              [30, "1M"],
              [90, "3M"],
            ].map(([days, label]) => (
              <button
                key={label}
                className={`pill${calWindow === days ? " active" : ""}`}
                onClick={() => setCalWindow(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="goal-line">
          <span className="goal-dot" /> Límite: {targets?.calories || 2400}{" "}
          kcal · TDEE: {profile?.tdee || 2910} kcal
        </div>
        {loading && <p className="muted">Cargando…</p>}
        {!loading && !weekDays.length && (
          <div className="empty-state">Sin datos</div>
        )}
        {!loading && !!weekDays.length && (
          <CalChart
            days={weekDays}
            target={targets?.calories || 2400}
            tdee={profile?.tdee || 2910}
            windowDays={calWindow}
          />
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">⚖️ Progreso de peso</div>
          {loading && <p className="muted">Cargando…</p>}
          {!loading && !weights.length && (
            <div className="empty-state">Sin registros de peso</div>
          )}
          {!loading && !!weights.length && (
            <>
              <div className="net-big">
                {weights[0].weight_kg}{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  kg
                </span>
              </div>
              <div className="muted" style={{ marginBottom: 8 }}>
                Último registro:{" "}
                {new Date(weights[0].measured_at + "T12:00:00").toLocaleDateString(
                  "es",
                  { day: "numeric", month: "short" }
                )}
                {profile?.goal_weight_kg
                  ? ` · Objetivo: ${profile.goal_weight_kg} kg`
                  : ""}
              </div>
              <div className="pills">
                {[
                  [14, "2S"],
                  [30, "1M"],
                  [90, "3M"],
                  [180, "6M"],
                  [365, "1A"],
                ].map(([days, label]) => (
                  <button
                    key={label}
                    className={`pill${weightWindow === days ? " active" : ""}`}
                    onClick={() => setWeightWindow(days)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <WeightChart
                weights={weights}
                goal={
                  profile?.goal_weight_kg
                    ? Number(profile.goal_weight_kg)
                    : null
                }
                windowDays={weightWindow}
              />
            </>
          )}
      </div>

      <MealPlan />
    </main>
  );
}

function MealPlan() {
  const p = MEAL_PLAN;
  const meals = [
    ["🌅 Desayuno", p.weekdays.desayuno],
    ["☀️ Almuerzo", p.weekdays.almuerzo],
    ["🏋️ Pre/Post Gym", p.weekdays.pre_gym],
    ["🌙 Cena", p.weekdays.cena],
  ];
  const head = {
    fontSize: 11,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: ".08em",
    marginBottom: 12,
  };
  return (
    <div style={{ marginTop: 20 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={head}>📋 Plan Semanal — Lunes a Viernes</div>
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
        <div style={head}>🍕 Fines de Semana</div>
        <div style={{ fontSize: 12 }}>{p.weekends.note}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          💡 {p.weekends.tip}
        </div>
        <div style={{ fontSize: 12, color: "#34d399", marginTop: 4 }}>
          Target: {p.weekends.target_kcal}
        </div>
      </div>
      <div className="card">
        <div style={head}>💡 Tips</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 8,
            marginTop: 4,
          }}
        >
          💡 Tips generales
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
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 8,
            marginTop: 12,
          }}
        >
          🍽️ Tus hábitos
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
    H = 260,
    P = { l: 48, r: 12, t: 14, b: 34 };
  const X = (i) =>
    P.l + (i / Math.max(slots.length - 1, 1)) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);

  // Ticks Y con paso lindo (1/2/5 × 10^n).
  const rawStep = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const yStep = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const yTicks = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi + 1e-9; v += yStep)
    yTicks.push(Math.round(v * 100) / 100);

  // Ticks X: hasta 8 fechas repartidas.
  const m = Math.min(8, slots.length);
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
  const diff = vals[vals.length - 1] - vals[0];

  return (
    <>
      <div ref={wrapRef}>
      <svg className="wchart" viewBox={`0 0 ${W} ${H}`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="#1e2a3a" />
            <text
              x={P.l - 6}
              y={Y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize="9"
              fill="#64748b"
            >
              {v} kg
            </text>
          </g>
        ))}
        {xIdx.map((i) => (
          <g key={slots[i].iso}>
            <line
              x1={X(i)}
              x2={X(i)}
              y1={P.t}
              y2={H - P.b}
              stroke="#1e2a3a"
            />
            <text
              x={X(i)}
              y={H - P.b + 13}
              textAnchor="middle"
              fontSize="9"
              fill="#64748b"
            >
              {slots[i].date
                .toLocaleDateString("es", { weekday: "short" })
                .replace(".", "")}
            </text>
            <text
              x={X(i)}
              y={H - P.b + 25}
              textAnchor="middle"
              fontSize="8"
              fill="#64748b"
            >
              {slots[i].date.toLocaleDateString("es", {
                day: "numeric",
                month: "short",
              })}
            </text>
          </g>
        ))}
        {goal != null && (
          <g>
            <line
              x1={P.l}
              x2={W - P.r}
              y1={Y(goal)}
              y2={Y(goal)}
              stroke="#34d399"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={W - P.r}
              y={Y(goal) - 4}
              textAnchor="end"
              fontSize="9"
              fontWeight="600"
              fill="#34d399"
            >
              Meta {goal} kg
            </text>
          </g>
        )}
        {area && <path d={area} fill="rgba(59,130,246,0.1)" />}
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
          <circle key={p.iso} cx={p.x} cy={p.y} r="4" fill="#3b82f6">
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
      {valids.length >= 2 && (
        <div className="weight-note">
          Cambio en el período: {diff > 0 ? "+" : ""}
          {diff.toFixed(1)} kg
        </div>
      )}
    </>
  );
}

function CalChart({ days, target, tdee, windowDays }) {
  const vals = days.map((d) => d.calories);
  const max = Math.max(target * 1.15, tdee * 1.05, ...vals, 100);
  const fmtTick = (v) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
  const step =
    windowDays >= 90 ? 7 : days.length > 14 ? Math.ceil(days.length / 10) : 1;
  const lineStep = windowDays >= 90 ? 3 : 1;
  const gap = days.length > 30 ? 2 : days.length > 14 ? 3 : 6;
  // División del eje y cada 500 kcal, como el original.
  const yTicks = [];
  for (let v = 0; v < max; v += 500) yTicks.push(v);
  const topTick = yTicks.length ? yTicks[yTicks.length - 1] : 0;
  return (
    <div className="vchart">
      <div className="voverlay">
        {days.map(
          (d, i) =>
            i % lineStep === 0 && (
              <div
                key={d.key}
                className="vgridv"
                style={{ left: `${(i / days.length) * 100}%` }}
              />
            )
        )}
        {yTicks.map((v) => (
          <div key={v} className="vgrid" style={{ bottom: `${(v / max) * 100}%` }}>
            <span>{fmtTick(v)}</span>
          </div>
        ))}
        {max - topTick > 1 && (
          <div className="vgrid" style={{ bottom: "100%" }}>
            <span className="below">{fmtTick(max)}</span>
          </div>
        )}
        <div className="vline tdee" style={{ bottom: `${(tdee / max) * 100}%` }}>
          <span className={(tdee / max) * 100 > 90 ? "below" : undefined}>
            TDEE {tdee}
          </span>
        </div>
        <div className="vline" style={{ bottom: `${(target / max) * 100}%` }}>
          <span className={(target / max) * 100 > 90 ? "below" : undefined}>
            Límite {target}
          </span>
        </div>
      </div>
      <div className="vcols" style={{ gap }}>
        {days.map((d, i) => {
          const h = Math.max(
            d.calories > 0 ? 2 : 0,
            (d.calories / max) * 100
          );
          const isToday = i === days.length - 1;
          const full = new Date(d.key).toLocaleDateString("es", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const label =
            windowDays > 14
              ? new Date(d.key).toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                })
              : d.label;
          const dateStr = new Date(d.key).toLocaleDateString("es", {
            day: "numeric",
            month: "short",
          });
          return (
            <div
              key={d.key}
              className={`vcol${isToday ? " vtoday" : ""}`}
              title={`${full}: ${d.calories} kcal`}
            >
              <div className="vval">
                {windowDays <= 14 && d.calories > 0 ? d.calories : ""}
              </div>
              <div className="vbarwrap">
                <div
                  className="vbar"
                  style={{
                    height: `${h}%`,
                    background:
                      d.calories > target ? "var(--red)" : "var(--blue)",
                  }}
                />
              </div>
              <div className="vday">
                {(i % step === 0 || isToday) &&
                  (windowDays > 14 ? (
                    label
                  ) : (
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

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}
