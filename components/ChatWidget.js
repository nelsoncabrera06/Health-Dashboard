"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../lib/supabaseClient";
import { addMeal, addWeight, isSupplementName } from "../lib/health";
import { addDemoMeal, upsertDemoWeight } from "../lib/demoSandbox";
import { validateImageFile, compressImage } from "../lib/chatPhoto";
import { VoiceRecorder, formatAudioTime, MAX_AUDIO_SECONDS } from "../lib/chatAudio";
import { dietLabel, countryLabel, goalLabel, supplementLabel } from "../lib/profile";

// Límite de adjunto y compresión: ver lib/chatPhoto.js.
const MIN_W = 320;
const DEFAULT_W = 420;
// El máximo es media pantalla, como pidió Nelson. `window` no existe en el
// servidor, así que el primer render usa el ancho por defecto.
const maxW = () =>
  typeof window === "undefined" ? 960 : Math.round(window.innerWidth * 0.5);
const clampW = (w) => Math.min(Math.max(w, MIN_W), Math.max(MIN_W, maxW()));

// 113.5 -> "113,5" (coma decimal, como se escribe acá).
const fmtKg = (kg) =>
  Number(kg).toLocaleString("es-AR", { maximumFractionDigits: 1 });

// Micrófono de línea (estilo Feather), sin emoji: hereda el color del botón.
function MicIcon({ size = 19 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="1.5" width="6" height="11.5" rx="3" />
      <path d="M5.5 11v1.5a6.5 6.5 0 0 0 13 0V11" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" />
    </svg>
  );
}

function AudioBubble({ src, duration }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setCurrentTime(el.currentTime);
    setProgress((el.currentTime / el.duration) * 100);
  };

  const onEnded = () => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
  };

  return (
    <div className="chat-voice-msg">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
      <button
        type="button"
        className="chat-voice-play"
        onClick={toggle}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div
        className="chat-voice-wave"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (audioRef.current && audioRef.current.duration) {
            audioRef.current.currentTime = pct * audioRef.current.duration;
          }
        }}
      >
        <div className="chat-voice-bar" style={{ width: `${progress}%` }} />
      </div>
      <span className="chat-voice-time">
        {formatAudioTime(playing ? currentTime : duration || 0)}
      </span>
    </div>
  );
}

const INITIAL_MSGS = [
  {
    role: "assistant",
    content:
      "Hola! Contame qué comiste y te estimo las calorías, Ej: “milanesa con puré”, o decime cual es tu peso y te lo registro, “mi peso de hoy es 75.3 kg”.",
  },
];

export default function ChatWidget({ targets, userId, isDemo, diets, country, goal, supplements, supplementsOther, creatineToday, creatineDays, proteinScoops, onSaved, mode = "side" }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(INITIAL_MSGS);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  // Qué tarjeta está guardando: "meal-3" / "weight-3" (una por vez).
  const [saving, setSaving] = useState(null);
  const [width, setWidth] = useState(DEFAULT_W);
  const [resizing, setResizing] = useState(false);
  // Paso 11: foto adjunta (data URL comprimida) + menú del botón "+".
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Grabación de audio (notas de voz estilo Telegram, máx. 30s).
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioError, setAudioError] = useState("");
  const recorderRef = useRef(null);
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
  const textareaRef = useRef(null);

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

  // Carga el uso de mensajes del día al abrir el chat
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await getSupabase().auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/chat", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancel) {
          const json = await res.json();
          setUsageInfo(json);
        }
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

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

  const cancelRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    setRecording(false);
    setRecordSeconds(0);
  };

  const stopAndSendAudio = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    recorderRef.current = null;
    const result = await rec.stop();
    if (!result || !result.dataUrl) return;
    await send(null, { audio: result.dataUrl, audioDuration: result.duration });
  };

  const startRecording = async () => {
    setAudioError("");
    setPhotoError("");
    setMenuOpen(false);
    try {
      const rec = new VoiceRecorder();
      recorderRef.current = rec;
      await rec.start({
        onTick: (s) => setRecordSeconds(s),
        onAutoStop: () => {
          stopAndSendAudio();
        },
      });
      setRecording(true);
      setRecordSeconds(0);
    } catch (err) {
      setAudioError(err.message || "No se pudo acceder al micrófono.");
      recorderRef.current = null;
      setRecording(false);
    }
  };

  const send = async (e, extra = {}) => {
    e?.preventDefault();
    const text = input.trim();
    const voice = extra?.audio || null;
    const voiceDuration = extra?.audioDuration || 0;
    if ((!text && !photo && !voice) || sending) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    // La foto viaja como data URL comprimida y el route la manda al modelo
    // con visión (paso 11). En el hilo queda visible igual.
    const shot = photo;
    setPhoto(null);
    setAudioError("");
    const next = [
      ...msgs,
      {
        role: "user",
        content: text,
        image: shot,
        audio: voice,
        audioDuration: voiceDuration,
      },
    ];
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
          audio: voice,
          targets: targets
            ? {
                calories: targets.calories,
                protein: targets.protein,
                carbs: targets.carbs,
                fat: targets.fat,
              }
            : null,
          diet:
            Array.isArray(diets) && diets.length
              ? diets.map(dietLabel)
              : undefined,
          country: country ? countryLabel(country) : undefined,
          goal: goal ? goalLabel(goal) : undefined,
          supplements: (() => {
            const list = [
              ...(Array.isArray(supplements)
                ? supplements.map(supplementLabel)
                : []),
              ...(typeof supplementsOther === "string" && supplementsOther.trim()
                ? [supplementsOther.trim()]
                : []),
            ];
            return list.length ? list : undefined;
          })(),
          supplementsToday: {
            creatine_g: creatineToday || null,
            creatine_days_7: creatineDays || 0,
            protein_scoops: proteinScoops || 0,
          },
        }),
      });
      const out = await r.json();
      if (!r.ok) {
        const e = new Error(out.error || `Error ${r.status}`);
        e.code = out.code || "";
        e.limit = out.limit;
        e.used = out.used;
        throw e;
      }
      if (typeof out.used === "number") {
        setUsageInfo({
          used: out.used,
          limit: out.limit,
          remaining: out.remaining,
          isDemo: out.isDemo,
        });
      }
      setMsgs((m) => {
        const next = [...m];
        // Nota de voz: el transcript pertenece a la burbuja del usuario, así
        // se ve qué se entendió (y sirve para depurar sin adivinar).
        if (out.transcript) {
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "user" && next[i].audio) {
              next[i] = { ...next[i], transcript: out.transcript };
              break;
            }
          }
        }
        next.push({
          role: "assistant",
          content: out.reply,
          estimate: out.estimate,
          weight: out.weight,
        });
        return next;
      });
    } catch (err) {
      if (typeof err.limit === "number") {
        setUsageInfo((prev) => ({
          ...prev,
          used: err.used ?? err.limit,
          limit: err.limit,
          remaining: 0,
        }));
      }
      // El límite de la demo se muestra como tarjeta con CTA, no como error.
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content:
            err.code === "demo_limit" ? err.message : err.message,
          code: err.code || "",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  // Paso 9c: guarda la estimación de una respuesta en `meals`.
  const saveMeal = async (idx) => {
    const est = msgs[idx]?.estimate;
    if (!est || saving !== null) return;
    setSaving(`meal-${idx}`);
    try {
      // Demo: la comida queda en el sandbox de la pestaña, no en la DB.
      if (isDemo) addDemoMeal(est);
      else await addMeal(userId, { ...est, source: "chat" });
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
      setSaving(null);
    }
  };

  // Descartar la estimación cuando el modelo se fue de mambo: no toca la DB.
  const discardMeal = (idx) =>
    setMsgs((all) =>
      all.map((m, i) => (i === idx ? { ...m, discarded: true } : m))
    );

  // Peso: mismo flujo que la comida. Se guarda recién con el botón y un solo
  // registro por día (si repite, pisa el anterior).
  const saveWeight = async (idx) => {
    const w = msgs[idx]?.weight;
    if (!w || saving !== null) return;
    setSaving(`weight-${idx}`);
    try {
      if (isDemo) upsertDemoWeight(w.weight);
      else await addWeight(userId, w.weight);
      setMsgs((all) =>
        all.map((m, i) =>
          i === idx ? { ...m, weightSaved: true, weightError: "" } : m
        )
      );
      await onSaved?.();
    } catch (err) {
      setMsgs((all) =>
        all.map((m, i) =>
          i === idx
            ? { ...m, weightError: err.message || "No se pudo guardar." }
            : m
        )
      );
    } finally {
      setSaving(null);
    }
  };

  const discardWeight = (idx) =>
    setMsgs((all) =>
      all.map((m, i) => (i === idx ? { ...m, weightDiscarded: true } : m))
    );

  const newChat = () => {
    if (sending) return;
    if (recording) cancelRecording();
    setMsgs(INITIAL_MSGS);
    setInput("");
    setPhoto(null);
    setPhotoError("");
    setAudioError("");
    setSaving(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <>
      {!open && (
        <button
          className="chat-fab"
          onClick={() => setOpen(true)}
          title="Abrir el asistente"
          aria-expanded={false}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.7 9.7 0 0 1-2.9-.4L4 21l1.5-4.1A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
            <div className="chat-title-row">
              <span className="chat-title">Asistente AI</span>
              {usageInfo && (
                <span
                  className={`chat-usage-badge${
                    usageInfo.remaining === 0
                      ? " danger"
                      : usageInfo.remaining <= 3
                      ? " warn"
                      : ""
                  }`}
                  title={`${usageInfo.remaining} mensajes restantes hoy`}
                >
                  mensajes usados {usageInfo.used}/{usageInfo.limit}
                </span>
              )}
            </div>
            <div className="chat-sub">
              Estimaciones, no consejo médico
            </div>
          </div>
          <div className="chat-head-actions">
            <button
              type="button"
              className="chat-btns"
              onClick={newChat}
              disabled={sending}
              title="Nuevo chat: Borrar y empezar de cero"
              aria-label="Nuevo chat"
            >
              ＋
            </button>
            <button
              type="button"
              className="chat-btns"
              onClick={() => setOpen(false)}
              title="Minimizar y ver los dashboards"
              aria-label="Minimizar el asistente"
            >
              —
            </button>
          </div>
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
              {m.audio && (
                <AudioBubble src={m.audio} duration={m.audioDuration} />
              )}
              {m.transcript && (
                <div className="chat-transcript" title="Lo que se entendió de la nota de voz">
                  <span className="chat-transcript-tag">Voz</span>
                  {m.transcript}
                </div>
              )}
              {!!m.content && <div className="chat-bubble">{m.content}</div>}
              {m.code === "demo_limit" && (
                <a
                  className="chat-demo-cta"
                  href="/logout"
                  title="Cierra la sesión demo y volvés al inicio para registrarte"
                >
                  Crear mi cuenta
                </a>
              )}
              {m.estimate && (
                <div className="chat-est">
                  <div className="chat-est-title">
                    {m.estimate.meal} · {m.estimate.calories} kcal
                    {isSupplementName(m.estimate.meal) && (
                      <span className="meal-tag">Suplemento</span>
                    )}
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
                        disabled={saving !== null}
                      >
                        {saving === `meal-${i}` ? "Guardando…" : "＋ Registrar"}
                      </button>
                      <button
                        className="chat-est-btn secondary"
                        onClick={() => discardMeal(i)}
                        disabled={saving !== null}
                        title="No la registres en el día"
                      >
                        ✕ Descartar
                      </button>
                    </div>
                  )}
                  {m.saveError && (
                    <div className="chat-est-err">{m.saveError}</div>
                  )}
                </div>
              )}
              {m.weight && (
                <div className="chat-est chat-weight">
                  <div className="chat-est-title">
                    {fmtKg(m.weight.weight)} kg · hoy
                  </div>
                  {m.weightSaved ? (
                    <div className="chat-est-saved">✓ Peso registrado</div>
                  ) : m.weightDiscarded ? (
                    <div className="chat-est-discarded">✕ Descartado</div>
                  ) : (
                    <div className="chat-est-actions">
                      <button
                        className="chat-est-btn"
                        onClick={() => saveWeight(i)}
                        disabled={saving !== null}
                      >
                        {saving === `weight-${i}`
                          ? "Guardando…"
                          : "＋ Registrar"}
                      </button>
                      <button
                        className="chat-est-btn secondary"
                        onClick={() => discardWeight(i)}
                        disabled={saving !== null}
                        title="No lo registres"
                      >
                        ✕ Descartar
                      </button>
                    </div>
                  )}
                  {m.weightError && (
                    <div className="chat-est-err">{m.weightError}</div>
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
        {photoError && <div className="chat-photo-err">{photoError}</div>}
        {audioError && <div className="chat-photo-err">{audioError}</div>}
        <form className="chat-input" onSubmit={send}>
          {recording ? (
            <div className="chat-rec-bar">
              <span className="chat-rec-dot" />
              <span className="chat-rec-time">
                {formatAudioTime(recordSeconds)} / {formatAudioTime(MAX_AUDIO_SECONDS)}
              </span>
              <button
                type="button"
                className="chat-rec-cancel"
                onClick={cancelRecording}
                title="Descartar nota de voz"
              >
                ✕ Descartar
              </button>
              <button
                type="button"
                className="btn chat-rec-send"
                onClick={stopAndSendAudio}
                title="Enviar nota de voz"
              >
                ➤
              </button>
            </div>
          ) : (
            <>
              <div className="chat-plus-wrap">
                <button
                  type="button"
                  className="chat-plus"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Adjuntar foto"
                  aria-expanded={menuOpen}
                  title="Adjuntar foto" 
                >
                  ...
                </button>
                {menuOpen && (
                  <div className="chat-attach-menu" role="menu">
                    {canCamera && (
                      <button
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                      >
                        Tomar foto
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                    >
                      Elegir imagen
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="chat-mic-btn"
                onClick={startRecording}
                disabled={sending}
                title="Grabar nota de voz (máx. 30s)"
                aria-label="Grabar nota de voz"
              >
                <MicIcon />
              </button>
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
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Qué comiste?"
                maxLength={1000}
                rows={1}
              />
              <button
                className="btn"
                type="submit"
                disabled={sending || (!input.trim() && !photo)}
              >
                ➤
              </button>
            </>
          )}
        </form>
      </aside>
    </>
  );
}
