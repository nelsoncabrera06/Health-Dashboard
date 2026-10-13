"use client";

import { useCallback, useEffect, useState } from "react";
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
  groupCaloriesByDay,
  sumMacros,
} from "../../lib/health";

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
  const [workouts, setWorkouts] = useState([]);
  const [weekDays, setWeekDays] = useState([]);
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
      const [t, prof, today, rec, todayW, weekMeals, wts] = await Promise.all([
        getTargets(user.id),
        getProfile(user.id).catch(() => null),
        getTodayMeals(user.id),
        getRecentMeals(user.id, 8),
        getTodayWorkouts(user.id).catch(() => []),
        getMealsSince(user.id, 7).catch(() => []),
        getRecentWeights(user.id, 365).catch(() => []),
      ]);
      setTargets(t);
      setProfile(prof);
      setTodayMeals(today);
      setRecent(rec);
      setWorkouts(todayW);
      setWeekDays(groupCaloriesByDay(weekMeals, 7));
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

        <div className="card">
          <div className="section-title">⚡ Ejercicio de hoy</div>
          {loading && <p className="muted">Cargando…</p>}
          {!loading && !workouts.length && (
            <div className="empty-state">Sin entrenamientos hoy</div>
          )}
          {!loading &&
            workouts.map((w) => (
              <div className="meal-row" key={w.id}>
                <div className="meal-name">
                  💪 {w.type}
                  <div className="muted">
                    ⏱ {w.duration_min} min
                    {w.notes ? ` · ${w.notes}` : ""}
                  </div>
                </div>
                <div className="meal-cal">-{Math.round(w.calories_burned)} kcal</div>
              </div>
            ))}
          {!loading && !!workouts.length && targets && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>
                ⚖️ Balance neto del día
              </div>
              <div className="net-big">
                {Math.round(
                  totals.calories -
                    workouts.reduce(
                      (s, w) => s + (Number(w.calories_burned) || 0),
                      0
                    )
                )}{" "}
                kcal
              </div>
              <div className="muted">
                🍽️ {Math.round(totals.calories)} consumidas · 🔥{" "}
                {Math.round(
                  workouts.reduce(
                    (s, w) => s + (Number(w.calories_burned) || 0),
                    0
                  )
                )}{" "}
                quemadas · 🎯 {targets.calories} target
              </div>
            </>
          )}
        </div>
      </div>

      {profile && (
        <div className="card" style={{ marginBottom: 20 }}>
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

      <div className="grid-bottom">
        <div className="card">
          <div className="section-title">📅 Últimos 7 días — Calorías</div>
          {loading && <p className="muted">Cargando…</p>}
          {!loading && !weekDays.length && (
            <div className="empty-state">Sin datos</div>
          )}
          {!loading &&
            weekDays.map((d) => {
              const max = Math.max(
                targets?.calories || 2400,
                ...weekDays.map((x) => x.calories)
              );
              const w = max > 0 ? Math.round((d.calories / max) * 100) : 0;
              return (
                <div className="day-row" key={d.key}>
                  <div className="day-label">{d.label}</div>
                  <div className="day-track">
                    <div
                      className="day-fill"
                      style={{
                        width: `${w}%`,
                        background: barColor(pct(d.calories, targets?.calories || 2400)),
                      }}
                    />
                  </div>
                  <div className="day-val">{d.calories}</div>
                </div>
              );
            })}
        </div>

        <div className="card">
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
              {(() => {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - weightWindow);
                const inWin = weights
                  .filter((w) => new Date(w.measured_at + "T12:00:00") >= cutoff)
                  .sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1));
                if (!inWin.length)
                  return <div className="empty-state">Sin datos en este período</div>;
                const vals = inWin.map((w) => Number(w.weight_kg));
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const span = max - min || 1;
                return inWin.map((w) => (
                  <div className="day-row" key={w.id}>
                    <div className="day-label">
                      {new Date(w.measured_at + "T12:00:00").toLocaleDateString(
                        "es",
                        { day: "numeric", month: "short" }
                      )}
                    </div>
                    <div className="day-track">
                      <div
                        className="day-fill"
                        style={{
                          width: `${Math.max(
                            8,
                            Math.round(((Number(w.weight_kg) - min) / span) * 100)
                          )}%`,
                          background: "var(--teal)",
                        }}
                      />
                    </div>
                    <div className="day-val">{w.weight_kg}</div>
                  </div>
                ));
              })()}
            </>
          )}
        </div>
      </div>
    </main>
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
