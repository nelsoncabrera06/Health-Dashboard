"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Paso 9a: ventana de chat abajo a la derecha (solo texto).
// Manda el access token de Supabase; la API key de OpenRouter
// queda solo en el servidor (app/api/chat/route.js).
export default function ChatWidget({ targets }) {
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
                <div className="chat-bubble">{m.content}</div>
                {m.estimate && (
                  <div className="chat-est">
                    <div className="chat-est-title">
                      🍽️ {m.estimate.meal} · {m.estimate.calories} kcal
                    </div>
                    <div className="chat-est-macros">
                      P {m.estimate.protein}g · C {m.estimate.carbs}g · G{" "}
                      {m.estimate.fat}g
                    </div>
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
