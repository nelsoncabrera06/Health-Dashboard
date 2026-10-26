"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  ACTIVITY_LEVELS,
  COUNTRIES,
  DIET_TAGS,
  SEXES,
  computeTargets,
  emptyForm,
  parseForm,
  profileToForm,
  saveOnboarding,
} from "../lib/profile";

const STEPS = ["Tus datos", "Tu objetivo", "Alimentación"];

function Field({ label, suffix, value, onChange, placeholder, hint }) {
  return (
    <label className="onb-field">
      <span>{label}</span>
      <div className="onb-input-wrap">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          autoComplete="off"
        />
        {suffix && <span className="onb-suffix">{suffix}</span>}
      </div>
      {hint && <span className="onb-hint">{hint}</span>}
    </label>
  );
}

// Wizard de onboarding / edición del perfil (3 pasos).
// Se muestra solo si `profiles.onboarded_at` es null; después se abre desde
// "✏️ Editar" en la tarjeta de perfil del dashboard.
export default function Onboarding({
  open,
  profile,
  currentWeight,
  onClose,
  onSaved,
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const firstTime = !profile?.onboarded_at;

  // Se inicializa al abrir, no en cada cambio de `profile`: un refresh del
  // dashboard mientras el wizard está abierto borraría lo que se escribió.
  useEffect(() => {
    if (!open) return;
    setForm(profileToForm(profile, currentWeight));
    setStep(0);
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const parsed = parseForm(form);
  const targets = computeTargets(parsed);
  const goalDiff =
    Number.isFinite(parsed.weight_kg) && Number.isFinite(parsed.goal_weight_kg)
      ? parsed.weight_kg - parsed.goal_weight_kg
      : 0;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDiet = (value) =>
    setForm((f) => ({
      ...f,
      diets: f.diets.includes(value)
        ? f.diets.filter((d) => d !== value)
        : [...f.diets, value],
    }));

  const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

  const validateStep = (s) => {
    if (s === 0) {
      if (!form.sex) return "Elegí una opción.";
      if (!inRange(parsed.age, 14, 100))
        return "La edad tiene que estar entre 14 y 100.";
      if (!inRange(parsed.height_cm, 100, 250))
        return "La altura tiene que estar entre 100 y 250 cm.";
      if (!inRange(parsed.weight_kg, 30, 300))
        return "El peso tiene que estar entre 30 y 300 kg.";
    }
    if (s === 1) {
      if (!parsed.activity) return "Elegí tu nivel de actividad.";
      if (!inRange(parsed.goal_weight_kg, 30, 300))
        return "El peso objetivo tiene que estar entre 30 y 300 kg.";
    }
    return "";
  };

  const next = () => {
    const msg = validateStep(step);
    if (msg) return setError(msg);
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const submit = async () => {
    const msg = validateStep(0) || validateStep(1);
    if (msg) return setError(msg);
    if (!targets) return setError("Revisá los datos: no pudimos calcular tus objetivos.");
    setSaving(true);
    setError("");
    try {
      await saveOnboarding(user.id, parsed);
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e.message || "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onb-overlay">
      <form
        className="onb-card"
        role="dialog"
        aria-modal="true"
        aria-label={firstTime ? "Configurar perfil" : "Editar perfil"}
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else submit();
        }}
      >
        <div className="onb-head">
          <div>
            <div className="onb-title">
              {firstTime ? "👋 Armemos tu perfil" : "✏️ Editar perfil"}
            </div>
            <div className="onb-sub">
              {firstTime
                ? "Son 3 pasos. Con estos datos calculamos tus objetivos diarios y el chat tiene en cuenta tus preferencias."
                : "Cambiá lo que necesites: al guardar recalculamos tus objetivos."}
            </div>
          </div>
          <button
            type="button"
            className="onb-x"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="onb-steps">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`onb-step${i === step ? " active" : ""}${
                i < step ? " done" : ""
              }`}
            >
              <span className="onb-step-num">{i < step ? "✓" : i + 1}</span>
              {label}
            </div>
          ))}
        </div>

        <div className="onb-body">
          {step === 0 && (
            <>
              <div className="onb-label">Sexo</div>
              <div className="onb-choice">
                {SEXES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`onb-choice-btn${
                      form.sex === s.value ? " active" : ""
                    }`}
                    onClick={() => set("sex", s.value)}
                    aria-pressed={form.sex === s.value}
                  >
                    <span className="onb-choice-icon">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="onb-grid">
                <Field
                  label="Edad"
                  suffix="años"
                  value={form.age}
                  onChange={(v) => set("age", v)}
                  placeholder="30"
                />
                <Field
                  label="Altura"
                  suffix="cm"
                  value={form.height}
                  onChange={(v) => set("height", v)}
                  placeholder="178"
                />
                <Field
                  label="Peso actual"
                  suffix="kg"
                  value={form.weight}
                  onChange={(v) => set("weight", v)}
                  placeholder="95.4"
                />
              </div>
              <p className="onb-note">
                La edad y la altura se usan para estimar cuánta energía gastás
                por día. El peso queda guardado como el registro de hoy.
              </p>

              <label className="onb-field onb-country">
                <span>
                  Ubicación: país{" "}
                  <span className="onb-optional">(opcional)</span>
                </span>
                <select
                  value={form.country}
                  onChange={(e) => set("country", e.target.value)}
                >
                  <option value="">Elegí tu país</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="onb-hint">
                  Nos sirve para tomar comidas y porciones típicas de tu país
                  como referencia.
                </span>
              </label>
            </>
          )}

          {step === 1 && (
            <>
              <div className="onb-grid">
                <Field
                  label="Peso objetivo"
                  suffix="kg"
                  value={form.goal}
                  onChange={(v) => set("goal", v)}
                  placeholder="90"
                />
                <div className="onb-goal-diff">
                  {Math.abs(goalDiff) >= 0.1 ? (
                    <>
                      <div className="onb-goal-big">
                        {Math.abs(goalDiff).toFixed(1)} kg
                      </div>
                      <div className="onb-hint">
                        {goalDiff > 0 ? "para bajar" : "para subir"}
                      </div>
                    </>
                  ) : (
                    <div className="onb-hint">Mantenimiento</div>
                  )}
                </div>
              </div>

              <div className="onb-label">Actividad semanal</div>
              <div className="onb-acts">
                {ACTIVITY_LEVELS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={`onb-act${
                      form.activity === a.value ? " active" : ""
                    }`}
                    onClick={() => set("activity", a.value)}
                    aria-pressed={form.activity === a.value}
                  >
                    <span className="onb-act-label">{a.label}</span>
                    <span className="onb-act-hint">{a.hint}</span>
                  </button>
                ))}
              </div>

              <div className="onb-preview">
                <div className="onb-preview-head">🎯 Tus objetivos diarios</div>
                {targets ? (
                  <>
                    <div className="onb-preview-grid">
                      <div>
                        <b>{targets.calories}</b>
                        <span>kcal</span>
                      </div>
                      <div>
                        <b>{targets.protein}</b>
                        <span>proteína</span>
                      </div>
                      <div>
                        <b>{targets.carbs}</b>
                        <span>carbos</span>
                      </div>
                      <div>
                        <b>{targets.fat}</b>
                        <span>grasas</span>
                      </div>
                    </div>
                    <div className="onb-hint">
                      Gasto estimado (TDEE): {targets.tdee} kcal ·{" "}
                      {targets.tdee > targets.calories
                        ? `déficit de ${targets.tdee - targets.calories} kcal/día`
                        : targets.tdee < targets.calories
                        ? `superávit de ${targets.calories - targets.tdee} kcal/día`
                        : "mantenimiento"}
                    </div>
                  </>
                ) : (
                  <div className="onb-hint">
                    Completá los datos del paso anterior para ver el cálculo.
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="onb-label">
                Categorías especiales <span className="onb-optional">(opcional)</span>
              </div>
              <div className="onb-chips">
                {DIET_TAGS.map((d) => {
                  const active = form.diets.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      className={`onb-chip${active ? " active" : ""}`}
                      onClick={() => toggleDiet(d.value)}
                      aria-pressed={active}
                    >
                      {d.icon} {d.label}
                    </button>
                  );
                })}
              </div>
              <p className="onb-note">
                El chat las tiene en cuenta al estimar y sugerir comidas. Podés
                elegir varias o ninguna.
              </p>

              <div className="onb-review">
                <div>
                  <span>Peso actual</span>
                  <b>{form.weight || "—"} kg</b>
                </div>
                <div>
                  <span>Objetivo</span>
                  <b>{form.goal || "—"} kg</b>
                </div>
                <div>
                  <span>Actividad</span>
                  <b>
                    {ACTIVITY_LEVELS.find((a) => a.value === form.activity)
                      ?.label || "—"}
                  </b>
                </div>
                <div>
                  <span>Objetivos</span>
                  <b>{targets ? `${targets.calories} kcal` : "—"}</b>
                </div>
              </div>
            </>
          )}

          {error && <p className="auth-error onb-error">{error}</p>}
        </div>

        <div className="onb-foot">
          <div>
            {step > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={back}
                disabled={saving}
              >
                ← Atrás
              </button>
            )}
          </div>
          <div className="onb-foot-right">
            {firstTime && (
              <button
                type="button"
                className="onb-skip"
                onClick={onClose}
                disabled={saving}
              >
                Saltar por ahora
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="submit" className="btn">
                Siguiente →
              </button>
            ) : (
              <button type="submit" className="btn" disabled={saving}>
                {saving
                  ? "Guardando…"
                  : firstTime
                  ? "Listo, empezar"
                  : "Guardar cambios"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
