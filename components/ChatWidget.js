"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { addMeal } from "../lib/health";

// Paso 9a: ventana de chat abajo a la derecha (solo texto).
// Paso 9c: la estimación se puede registrar en `meals` con un botón.
// Manda el access token de Supabase; la API key de OpenRouter
// queda solo en el servidor (app/api/chat/route.js).
export default function ChatWidget({ targets, userId, onSaved }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    {
      role: "assistant",
      content:
        "Hola! Contame qué comiste y te estimo las calorías. Ej: “milanesa con puré”.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [savingIdx, setSavingIdx] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.slice(-20),
          targets: targets
            ? {
                calories: targets.calories,
                protein: targets.protein,
                carbs: targets.carbs,
                fat: targets.fat,
              }
            : null,
        }),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || `Error ${r.status}`);
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: out.reply, estimate: out.estimate },
      ]);
    } catch (err) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${err.message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Paso 9c: guarda la estimación de una respuesta en `meals`.
  const saveMeal = async (idx) => {
    const est = msgs[idx]?.estimate;
    if (!est || savingIdx !== null) return;
    setSavingIdx(idx);
    try {
      await addMeal(userId, est);
      setMsgs((all) =>
        all.map((m, i) => (i === idx ? { ...m, saved: true, saveError: "" } : m))
      );
      await onSaved?.();
    } catch (err) {
      setMsgs((all) =>
        all.map((m, i) =>
          i === idx
            ? { ...m, saveError: err.message || "No se pudo guardar." }
            : m
        )
      );
    } finally {
      setSavingIdx(null);
    }
  };

  // Descartar la estimación cuando el modelo se fue de mambo: no toca la DB.
  const discardMeal = (idx) =>
    setMsgs((all) =>
      all.map((m, i) => (i === idx ? { ...m, discarded: true } : m))
    );

  return (
    <>
      <button
        className="chat-fab"
        onClick={() => setOpen((o) => !o)}
        title="Chatear con la AI"
      >
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <div>
              <div className="chat-title">🤖 Asistente</div>
              <div className="chat-sub">
                Estimaciones, no consejo médico
              </div>
            </div>
          </div>
          <div className="chat-msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {!!m.content && <div className="chat-bubble">{m.content}</div>}
                {m.estimate && (
                  <div className="chat-est">
                    <div className="chat-est-title">
                      🍽️ {m.estimate.meal} · {m.estimate.calories} kcal
                    </div>
                    <div className="chat-est-macros">
                      P {m.estimate.protein}g · C {m.estimate.carbs}g · G{" "}
                      {m.estimate.fat}g
                    </div>
                    {m.saved ? (
                      <div className="chat-est-saved">✓ Registrado en el día</div>
                    ) : m.discarded ? (
                      <div className="chat-est-discarded">✕ Descartado</div>
                    ) : (
                      <div className="chat-est-actions">
                        <button
                          className="chat-est-btn"
                          onClick={() => saveMeal(i)}
                          disabled={savingIdx !== null}
                        >
                          {savingIdx === i ? "Guardando…" : "＋ Registrar"}
                        </button>
                        <button
                          className="chat-est-btn secondary"
                          onClick={() => discardMeal(i)}
                          disabled={savingIdx !== null}
                          title="No la registres en el día"
                        >
                          ✕ Descartar
                        </button>
                      </div>
                    )}
                    {m.saveError && (
                      <div className="chat-est-err">⚠️ {m.saveError}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="chat-msg assistant">
                <div className="chat-bubble muted">Escribiendo…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form className="chat-input" onSubmit={send}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Qué comiste?"
              maxLength={1000}
            />
            <button className="btn" type="submit" disabled={sending || !input.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
