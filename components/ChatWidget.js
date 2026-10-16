"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import { addMeal } from "../lib/health";
import { validateImageFile, compressImage } from "../lib/chatPhoto";

// Límite de adjunto y compresión: ver lib/chatPhoto.js.
const MIN_W = 320;
const DEFAULT_W = 420;
// El máximo es media pantalla, como pidió Nelson. `window` no existe en el
// servidor, así que el primer render usa el ancho por defecto.
const maxW = () =>
  typeof window === "undefined" ? 960 : Math.round(window.innerWidth * 0.5);
const clampW = (w) => Math.min(Math.max(w, MIN_W), Math.max(MIN_W, maxW()));

export default function ChatWidget({ targets, userId, onSaved, mode = "side" }) {
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
  const [width, setWidth] = useState(DEFAULT_W);
  const [resizing, setResizing] = useState(false);
  // Paso 11: foto adjunta (data URL comprimida) + menú del botón "+".
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // "Tomar foto" solo tiene sentido con cámara trasera (celu). En PC el
  // capture abriría el mismo file picker que la galería: se oculta.
  // Se lee en un efecto (no en el useState) porque en el servidor no hay window.
  const [canCamera, setCanCamera] = useState(false);
  useEffect(() => {
    setCanCamera(
      !!window.matchMedia?.("(pointer: coarse)").matches
    );
  }, []);
  const bottomRef = useRef(null);
  const widthRef = useRef(DEFAULT_W);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  // El panel empuja el dashboard en desktop y en modo "de costado": la clase va
  // en el <body> porque el padding que achica el contenido lo define el layout.
  // En modo "encima" no se toca nada: el panel flota sobre el contenido.
  useEffect(() => {
    const shift = open && mode === "side";
    document.body.classList.toggle("chat-open", shift);
    return () => document.body.classList.remove("chat-open");
  }, [open, mode]);

  // El ancho se aplica como variable CSS: el padding del body usa la misma
  // variable, así el dashboard y el panel no se pueden desincronizar.
  useEffect(() => {
    widthRef.current = width;
    document.documentElement.style.setProperty("--chat-w", `${width}px`);
  }, [width]);

  // Ancho guardado + clamp si achican la ventana. Se lee recién acá y no en el
  // useState: `localStorage` no existe en el servidor.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("chatWidth"));
      if (isFinite(saved) && saved > 0) setWidth(clampW(saved));
    } catch {
      // Storage bloqueado (incógnito): queda el ancho por defecto.
    }
    const onResize = () => setWidth((w) => clampW(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Arrastre del handle. Los listeners van en `window` para que el mouse no se
  // "escape" del handle de 8px cuando el movimiento es rápido. Se guarda la
  // preferencia al soltar, no en cada pixel arrastrado.
  useEffect(() => {
    if (!resizing) return;
    const move = (e) => setWidth(clampW(window.innerWidth - e.clientX));
    const stop = () => {
      setResizing(false);
      try {
        localStorage.setItem("chatWidth", String(widthRef.current));
      } catch {
        // Sin storage: el ancho dura lo que la sesión.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [resizing]);

  useEffect(() => {
    document.body.classList.toggle("chat-resizing", resizing);
    return () => document.body.classList.remove("chat-resizing");
  }, [resizing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const onPickFile = async (e) => {
    setMenuOpen(false);
    const f = e.target.files?.[0];
    // Se limpia para que se pueda elegir el mismo archivo dos veces.
    e.target.value = "";
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      setPhotoError(err);
      return;
    }
    setPhotoError("");
    try {
      setPhoto(await compressImage(f));
    } catch {
      setPhotoError("No se pudo procesar la imagen.");
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && !photo) || sending) return;
    setInput("");
    // La foto viaja en el body (el route todavía la ignora: el análisis con
    // visión es el siguiente paso). En el hilo queda visible igual.
    const shot = photo;
    setPhoto(null);
    const next = [...msgs, { role: "user", content: text, image: shot }];
    setMsgs(next);
    setSending(true);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data?.session?.access_token;
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.slice(-20).map(({ role, content }) => ({ role, content })),
          image: shot,
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
      {!open && (
        <button
          className="chat-fab"
          onClick={() => setOpen(true)}
          title="Abrir el asistente"
          aria-expanded={false}
        >
          💬
        </button>
      )}
      <aside
        className={`chat-drawer${open ? " open" : ""}`}
        aria-hidden={!open}
        aria-label="Asistente de nutrición"
      >
        <div
          className="chat-resize"
          onPointerDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Ajustar el ancho del chat"
          title="Arrastrá para cambiar el ancho (máx. media pantalla)"
        />
        <div className="chat-head">
          <div>
            <div className="chat-title">🤖 Asistente</div>
            <div className="chat-sub">
              Estimaciones, no consejo médico
            </div>
          </div>
          <button
            className="chat-min"
            onClick={() => setOpen(false)}
            title="Minimizar y ver los dashboards"
            aria-label="Minimizar el asistente"
          >
            —
          </button>
        </div>
        <div className="chat-msgs">
          {msgs.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.image && (
                <img
                  className="chat-photo"
                  src={m.image}
                  alt="Foto adjunta de la comida"
                />
              )}
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
        {photo && (
          <div className="chat-preview">
            <img src={photo} alt="Vista previa de la foto a enviar" />
            <button
              type="button"
              className="chat-preview-x"
              onClick={() => setPhoto(null)}
              aria-label="Quitar la foto"
            >
              ✕
            </button>
          </div>
        )}
        {photoError && <div className="chat-photo-err">⚠️ {photoError}</div>}
        <form className="chat-input" onSubmit={send}>
          <div className="chat-plus-wrap">
            <button
              type="button"
              className="chat-plus"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Adjuntar foto"
              aria-expanded={menuOpen}
              title="Adjuntar foto"
            >
              ＋
            </button>
            {menuOpen && (
              <div className="chat-attach-menu" role="menu">
                {canCamera && (
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                  >
                    📷 Tomar foto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                >
                  🖼️ Elegir imagen
                </button>
              </div>
            )}
          </div>
          <input
            type="file"
            ref={galleryRef}
            accept="image/*"
            hidden
            onChange={onPickFile}
          />
          <input
            type="file"
            ref={cameraRef}
            accept="image/*"
            capture="environment"
            hidden
            onChange={onPickFile}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Qué comiste?"
            maxLength={1000}
          />
          <button
            className="btn"
            type="submit"
            disabled={sending || (!input.trim() && !photo)}
          >
            ➤
          </button>
        </form>
      </aside>
    </>
  );
}
