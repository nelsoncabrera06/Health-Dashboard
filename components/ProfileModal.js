"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { activityLabel, countryLabel, dietLabel, sexLabel } from "../lib/profile";

function Stat({ label, value, color, sub }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function imcStat(weight, height) {
  const imc = Number(weight) / Math.pow(Number(height) / 100, 2);
  if (imc < 18.5)
    return { value: imc.toFixed(1), sub: "(Bajo peso: <18.5)", color: "var(--blue)" };
  if (imc < 25)
    return { value: imc.toFixed(1), sub: "(Normal: 18.5–25)", color: "var(--green)" };
  if (imc < 30)
    return { value: imc.toFixed(1), sub: "(Sobrepeso: 25–30)", color: "var(--yellow)" };
  return { value: imc.toFixed(1), sub: "(Obesidad: 30+)", color: "var(--red)" };
}

// Ventana flotante "Mis datos": muestra todos los datos cargados y desde acá
// se abre el editar existente (Onboarding) o se elimina la cuenta.
export default function ProfileModal({
  open,
  profile,
  currentWeight,
  userId,
  onClose,
  onEdit,
}) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const close = () => {
    setConfirming(false);
    setError("");
    onClose();
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión inválida. Volvé a iniciar sesión.");

      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetId: userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar la cuenta.");

      await signOut();
      router.push("/");
    } catch (e) {
      setError(e.message || "No se pudo eliminar la cuenta.");
      setDeleting(false);
    }
  };

  const weight = currentWeight ? Number(currentWeight) : null;
  const goal = profile?.goal_weight_kg ? Number(profile.goal_weight_kg) : null;

  return (
    <div className="onb-overlay" onClick={close}>
      <div
        className="onb-card profile-card"
        role="dialog"
        aria-modal="true"
        aria-label="Mis datos"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onb-head">
          <div>
            <div className="onb-title">
              Mis datos
              {profile?.display_name || profile?.username
                ? ` — ${profile.display_name || profile.username}`
                : ""}
            </div>
            <div className="onb-sub">Tus datos y objetivos actuales.</div>
          </div>
          <button type="button" className="onb-x" onClick={close} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="onb-body">
          {!profile ? (
            <p className="muted">Cargando…</p>
          ) : (
            <>
              <div className="stat-grid">
                {profile.height_cm && (
                  <Stat label="Altura" value={`${profile.height_cm} cm`} />
                )}
                {weight && <Stat label="Peso actual" value={`${weight} kg`} />}
                {goal && (
                  <Stat label="Objetivo" value={`${goal} kg`} color="var(--green)" />
                )}
                {weight && goal && (
                  <Stat
                    label={weight >= goal ? "Por bajar" : "Por subir"}
                    value={`${Math.abs(weight - goal).toFixed(1)} kg`}
                    color="var(--yellow)"
                  />
                )}
                {profile.height_cm && weight && (
                  <Stat label="IMC" {...imcStat(weight, profile.height_cm)} />
                )}
                {profile.age && <Stat label="Edad" value={`${profile.age} años`} />}
                {sexLabel(profile.sex) && (
                  <Stat label="Sexo" value={sexLabel(profile.sex)} />
                )}
                {profile.country && (
                  <Stat label="País" value={countryLabel(profile.country)} />
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
                    label={
                      profile.tdee >= profile.calories_target
                        ? "Déficit diario"
                        : "Superávit diario"
                    }
                    value={`${Math.abs(profile.tdee - profile.calories_target)} kcal`}
                    color={
                      profile.tdee >= profile.calories_target
                        ? "var(--red)"
                        : "var(--green)"
                    }
                  />
                )}
                {profile.activity && (
                  <Stat label="Actividad" value={activityLabel(profile.activity)} />
                )}
              </div>

              <div className="diet-row">
                <span className="stat-label">Alimentación</span>
                <div className="diet-tags">
                  {Array.isArray(profile.diet_tags) && profile.diet_tags.length ? (
                    profile.diet_tags.map((tag) => (
                      <span className="diet-tag" key={tag}>
                        {dietLabel(tag)}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Sin preferencias cargadas</span>
                  )}
                </div>
              </div>

              {confirming && (
                <div className="profile-danger">
                  <div className="profile-danger-title">
                    ¿Eliminar tu cuenta definitivamente?
                  </div>
                  <p className="profile-danger-text">
                    Se borran tu perfil, comidas, entrenamientos y pesos. Esta
                    acción no se puede deshacer.
                  </p>
                  {error && <p className="auth-error">{error}</p>}
                  <div className="profile-danger-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setConfirming(false)}
                      disabled={deleting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? "Eliminando…" : "Sí, eliminar mi cuenta"}
                    </button>
                  </div>
                </div>
              )}

              {error && !confirming && <p className="auth-error">{error}</p>}
            </>
          )}
        </div>

        <div className="profile-foot">
          <button
            type="button"
            className="profile-delete-link"
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
            disabled={!profile || confirming}
          >
            Eliminar usuario
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onEdit}
            disabled={!profile}
          >
            ✏️ Editar
          </button>
        </div>
      </div>
    </div>
  );
}
