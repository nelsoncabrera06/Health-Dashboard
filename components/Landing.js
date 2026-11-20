"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";

// Landing pública para usuarios sin sesión. El CSS vive en app/landing.css
// y está scopeado con `.landing` para no tocar el dashboard.
export default function Landing() {
  const { user, ready, signInDemo, canDemo } = useAuth();
  const router = useRouter();
  const rootRef = useRef(null);

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");

  // El body global tiene padding para el dashboard; la landing va a sangre.
  useEffect(() => {
    document.body.classList.add("landing-body");
    return () => document.body.classList.remove("landing-body");
  }, []);

  // Logueado no tiene nada que hacer acá: directo al dashboard.
  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal al entrar en viewport (mismo criterio que el HTML original).
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".reveal");
    if (!els?.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const closeMenu = () => setMenuOpen(false);

  const handleDemo = async () => {
    setDemoError("");
    if (!canDemo) {
      openAuth("login");
      return;
    }
    setDemoBusy(true);
    try {
      await signInDemo();
      router.push("/dashboard");
    } catch (err) {
      setDemoError(err.message);
      setDemoBusy(false);
    }
  };

  return (
    <>
      <div className="landing" id="top" ref={rootRef}>
        <div className="landing-bg" aria-hidden="true" />

        {/* ═══════════ HEADER ═══════════ */}
        <header className={`site-head${scrolled ? " scrolled" : ""}`}>
          <div className="container head-inner">
            <a className="brand" href="#top" aria-label="Health Dashboard, inicio">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <rect x="3" y="18" width="5" height="10" rx="1.5" fill="#3b82f6" />
                  <rect x="10.5" y="12" width="5" height="16" rx="1.5" fill="#22c55e" />
                  <rect x="18" y="16" width="5" height="12" rx="1.5" fill="#a855f7" />
                  <rect x="25.5" y="7" width="5" height="21" rx="1.5" fill="#14b8a6" />
                </svg>
              </span>
              <span className="brand-name">
                Health<span>Dashboard</span>
              </span>
            </a>

            <nav className="nav" aria-label="Principal">
              <a href="#como">Cómo funciona</a>
              <a href="#funciones">Funciones</a>
              <a href="#chat">El chat</a>
              <a href="#faq">Preguntas</a>
            </nav>

            <div className="head-cta">
              <button type="button" className="btn btn-ghost" onClick={() => openAuth("login")}>
                Entrar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openAuth("register")}>
                Empezar gratis
              </button>
            </div>

            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobileNav"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>

          <div className={`mobile-nav${menuOpen ? " open" : ""}`} id="mobileNav">
            <a href="#como" onClick={closeMenu}>Cómo funciona</a>
            <a href="#funciones" onClick={closeMenu}>Funciones</a>
            <a href="#chat" onClick={closeMenu}>El chat</a>
            <a href="#faq" onClick={closeMenu}>Preguntas</a>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                closeMenu();
                openAuth("register");
              }}
            >
              Empezar gratis
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 8 }}
              onClick={() => {
                closeMenu();
                openAuth("login");
              }}
            >
              Entrar
            </button>
          </div>
        </header>

        <main>
          {/* ═══════════ HERO ═══════════ */}
          <section className="hero">
            <div className="container">
              <div className="hero-grid">
                <div className="hero-copy">
                  <span className="hero-badge">
                    <span className="pulse" aria-hidden="true" />
                    Nutrición sin planillas ni formularios
                  </span>
                  <h1>
                    Trackea tus comidas 
                    <br />
                    <span className="grad">La IA hace las cuentas.</span>
                  </h1>
                  <p className="lead">
                    Contale lo que comiste a la IA, o sacale una foto a tu plato y vas a tener
                    las calorías, proteína, carbos y grasas de tu comida al instante. Después
                    ves tu día, tu progreso y tu peso en gráficos que se entienden de un vistazo.
                  </p>
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      onClick={() => openAuth("register")}
                    >
                      Crear cuenta gratis
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-lg"
                      onClick={handleDemo}
                      disabled={demoBusy}
                    >
                      <span className="dot" aria-hidden="true" />
                      {demoBusy ? "Entrando…" : "Probar la demo"}
                    </button>
                  </div>
                  {demoError && <p className="hero-error">{demoError}</p>}
                  <div className="hero-micro">
                    <span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Sin tarjeta
                    </span>
                    <span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Google o email
                    </span>
                    <span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Funciona en el celular
                    </span>
                  </div>
                </div>

                <div className="hero-visual">
                  <div className="mock-glow" aria-hidden="true" />

                  <div
                    className="mock"
                    role="img"
                    aria-label="Vista previa del dashboard con macros del día y gráfico de calorías"
                  >
                    <div className="mock-top">
                      <div className="dots" aria-hidden="true"><i /><i /><i /></div>
                      <span className="mock-url">nutritiondashboard.vercel.app/dashboard</span>
                    </div>
                    <div className="mock-body">
                      <div className="mock-head">
                        <div>
                          <div className="mock-hello">Hola, Nico</div>
                          <div className="mock-date">Hoy, viernes 20 de noviembre</div>
                        </div>
                        <div className="mock-avatar">N</div>
                      </div>

                      <div className="mock-macros">
                        <div className="mcard">
                          <div className="mlabel">Calorías</div>
                          <div className="mval">1.840</div>
                          <div className="msub">de 2.400</div>
                          <div className="mtrack">
                            <div className="mfill" style={{ width: "77%", background: "var(--orange)" }} />
                          </div>
                        </div>
                        <div className="mcard">
                          <div className="mlabel">Proteína</div>
                          <div className="mval">
                            132
                            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)" }}> g</span>
                          </div>
                          <div className="msub">de 172 g</div>
                          <div className="mtrack">
                            <div className="mfill" style={{ width: "77%", background: "var(--blue)" }} />
                          </div>
                        </div>
                        <div className="mcard">
                          <div className="mlabel">Carbos</div>
                          <div className="mval">
                            210
                            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)" }}> g</span>
                          </div>
                          <div className="msub">de 277 g</div>
                          <div className="mtrack">
                            <div className="mfill" style={{ width: "76%", background: "var(--yellow)" }} />
                          </div>
                        </div>
                        <div className="mcard">
                          <div className="mlabel">Grasas</div>
                          <div className="mval">
                            61
                            <span style={{ fontSize: 9, fontWeight: 500, color: "var(--muted)" }}> g</span>
                          </div>
                          <div className="msub">de 76 g</div>
                          <div className="mtrack">
                            <div className="mfill" style={{ width: "80%", background: "var(--teal)" }} />
                          </div>
                        </div>
                      </div>

                      <div className="mock-panel">
                        <div className="mock-panel-head">
                          <span className="mock-panel-title">Calorías · últimos 7 días</span>
                          <div className="mock-pills" aria-hidden="true">
                            <span className="on">7D</span>
                            <span>2S</span>
                            <span>1M</span>
                          </div>
                        </div>
                        <div className="mock-chart">
                          <div className="bars">
                            <div className="bar"><i style={{ "--h": "58%" }} /><span>L</span></div>
                            <div className="bar"><i style={{ "--h": "79%" }} /><span>M</span></div>
                            <div className="bar"><i style={{ "--h": "66%" }} /><span>M</span></div>
                            <div className="bar over"><i style={{ "--h": "96%" }} /><span>J</span></div>
                            <div className="bar"><i style={{ "--h": "48%" }} /><span>V</span></div>
                            <div className="bar"><i style={{ "--h": "72%" }} /><span>S</span></div>
                            <div className="bar"><i style={{ "--h": "34%" }} /><span>D</span></div>
                          </div>
                          <div className="limit-line" style={{ "--at": "82%" }}><b>límite</b></div>
                        </div>
                        <div className="bar-labels" aria-hidden="true">
                          <span>lun</span><span>mar</span><span>mié</span><span>jue</span>
                          <span>vie</span><span>sáb</span><span>dom</span>
                        </div>
                      </div>

                      <div className="mock-panel" style={{ marginTop: 8 }}>
                        <div className="mock-panel-head">
                          <span className="mock-panel-title">Últimas comidas</span>
                          <span className="mock-link">Ver todo</span>
                        </div>
                        <div className="mock-meals">
                          <div className="mock-meal">
                            <span className="mm-time">13:20</span>
                            <span className="mm-name">Milanesa con puré</span>
                            <b className="mm-cal">780 kcal</b>
                          </div>
                          <div className="mock-meal">
                            <span className="mm-time">09:05</span>
                            <span className="mm-name">Café con leche y medialunas</span>
                            <b className="mm-cal">420 kcal</b>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="float-chat" aria-hidden="true">
                    <div className="fc-head">
                      <span className="fc-ai">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                        </svg>
                      </span>
                      <span className="fc-title">Asistente IA</span>
                      <span className="fc-live">en línea</span>
                    </div>
                    <div className="fc-msgs">
                      <div className="fc-b user">Almorcé milanesa con puré y ensalada</div>
                      <div className="fc-b ai">Tiene buena pinta. Te estimo los macros:</div>
                      <div className="fc-est">
                        <b>≈ 780 kcal</b>
                        <span>42 g proteína · 68 g carbos · 36 g grasa</span>
                        <div className="fc-btns"><i>Registrar</i><i>Descartar</i></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="cap-strip reveal">
                <span className="cap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <b>Chat con IA</b> que entiende comida
                </span>
                <span className="cap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <b>Fotos del plato</b> desde el celular
                </span>
                <span className="cap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="M7 15l4-5 4 3 5-7" />
                  </svg>
                  <b>Gráficos</b> de calorías y peso
                </span>
                <span className="cap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <b>Metas</b> calculadas para vos
                </span>
              </div>
            </div>
          </section>

          {/* ═══════════ CÓMO FUNCIONA ═══════════ */}
          <section className="section" id="como">
            <div className="container">
              <div className="section-head reveal">
                <div className="eyebrow">Cómo funciona</div>
                <h2 className="section-title">Tres pasos, cero planillas</h2>
                <p className="section-sub">
                  Sin pesar cada gramo y sin buscar códigos de barras. Hablás normal y el
                  dashboard hace el resto.
                </p>
              </div>

              <div className="steps">
                <article className="step reveal" style={{ "--d": ".05s" }}>
                  <div className="step-num"><b>01</b> — Contá</div>
                  <div
                    className="step-icon"
                    style={{ color: "#93c5fd", background: "rgba(59,130,246,.12)", borderColor: "rgba(59,130,246,.3)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3>Escribí lo que comiste</h3>
                  <p>
                    «Dos tostadas con queso y un café con leche». Así de simple. También podés
                    mandar una foto del plato y listo.
                  </p>
                </article>

                <article className="step reveal" style={{ "--d": ".12s" }}>
                  <div className="step-num"><b>02</b> — Estimá</div>
                  <div
                    className="step-icon"
                    style={{ color: "#5eead4", background: "rgba(20,184,166,.12)", borderColor: "rgba(20,184,166,.3)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                      <path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17z" />
                    </svg>
                  </div>
                  <h3>La IA calcula los macros</h3>
                  <p>
                    Calorías, proteína, carbos y grasas en segundos. Revisás la estimación y la
                    registrás con un clic.
                  </p>
                </article>

                <article className="step reveal" style={{ "--d": ".19s" }}>
                  <div className="step-num"><b>03</b> — Mirá</div>
                  <div
                    className="step-icon"
                    style={{ color: "#fdba74", background: "rgba(249,115,22,.12)", borderColor: "rgba(249,115,22,.3)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <path d="M7 15l4-5 4 3 5-7" />
                    </svg>
                  </div>
                  <h3>Seguí tu progreso</h3>
                  <p>
                    Barras diarias contra tu límite, balance neto, historial de comidas y
                    evolución del peso. Todo en una pantalla.
                  </p>
                </article>
              </div>
            </div>
          </section>

          {/* ═══════════ FUNCIONES ═══════════ */}
          <section className="section" id="funciones">
            <div className="container">
              <div className="section-head reveal">
                <div className="eyebrow">Funciones</div>
                <h2 className="section-title">Lo que hace, sin vueltas</h2>
                <p className="section-sub">
                  Herramientas pensadas para el día a día, no para llenar un Excel.
                </p>
              </div>

              <div className="bento">
                <article className="bcard wide reveal" style={{ "--d": ".04s" }}>
                  <div className="bicon blue">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3>Chateá, no cargues formularios</h3>
                  <p>
                    Describí tu comida como se lo contarías a un amigo. El asistente estima los
                    macros, responde dudas y tiene en cuenta tus dietas y tu país.
                  </p>
                  <div className="bviz">
                    <div className="mini-b user">
                      Desayuné dos tostadas con queso y un café con leche
                    </div>
                    <div className="mini-b ai">
                      Listo. Te paso la estimación y la registrás cuando quieras.
                    </div>
                    <div className="mini-input">
                      <span className="plus">+</span>
                      Escribí o adjuntá una foto…
                      <span className="send">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </article>

                <article className="bcard reveal" style={{ "--d": ".1s" }}>
                  <div className="bicon teal">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <h3>Una foto vale mil calorías</h3>
                  <p>
                    Sacá la foto en el momento o elegí una de la galería. La IA reconoce el plato
                    y estima.
                  </p>
                  <div className="bviz">
                    <div className="photo-row">
                      <div className="photo-tile" aria-hidden="true" />
                      <svg className="arrow-sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <div className="est-mini">
                        <b>≈ 620 kcal</b>
                        <span>38 P · 54 C · 26 G</span>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="bcard reveal" style={{ "--d": ".06s" }}>
                  <div className="bicon orange">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3v18h18" />
                      <path d="M7 15l4-5 4 3 5-7" />
                    </svg>
                  </div>
                  <h3>Gráficos que se entienden</h3>
                  <p>
                    Calorías por día con tu límite marcado, y la evolución del peso en una línea
                    clara.
                  </p>
                  <div className="bviz">
                    <div className="mini-chart" aria-hidden="true">
                      <i style={{ "--h": "52%" }} />
                      <i style={{ "--h": "74%" }} />
                      <i style={{ "--h": "61%" }} />
                      <i className="hot" style={{ "--h": "94%" }} />
                      <i style={{ "--h": "44%" }} />
                      <i style={{ "--h": "68%" }} />
                      <i style={{ "--h": "31%" }} />
                    </div>
                    <div className="mini-legend">
                      <span><i style={{ background: "var(--blue)" }} /> bajo el límite</span>
                      <span><i style={{ background: "var(--red)" }} /> pasado</span>
                    </div>
                  </div>
                </article>

                <article className="bcard reveal" style={{ "--d": ".12s" }}>
                  <div className="bicon purple">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 3v7a3 3 0 0 0 6 0V3" />
                      <path d="M7 10v11" />
                      <path d="M17 3c-1.7 1.2-2.5 3.2-2.5 5.5 0 1.8.9 3 2.5 3.5V21" />
                    </svg>
                  </div>
                  <h3>Un plan de comidas de referencia</h3>
                  <p>
                    Ideas de desayuno, almuerzo y cena para la semana, con tips y hábitos simples
                    de sostener.
                  </p>
                  <div className="bviz">
                    <div className="meal-line">
                      <em style={{ background: "var(--yellow)" }} />
                      <span>Desayuno</span><b>420 kcal</b>
                    </div>
                    <div className="meal-line">
                      <em style={{ background: "var(--orange)" }} />
                      <span>Almuerzo</span><b>780 kcal</b>
                    </div>
                    <div className="meal-line">
                      <em style={{ background: "var(--teal)" }} />
                      <span>Merienda</span><b>260 kcal</b>
                    </div>
                    <div className="meal-line">
                      <em style={{ background: "var(--purple)" }} />
                      <span>Cena</span><b>640 kcal</b>
                    </div>
                  </div>
                </article>

                <article className="bcard reveal" style={{ "--d": ".18s" }}>
                  <div className="bicon green">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                    </svg>
                  </div>
                  <h3>Metas a tu medida</h3>
                  <p>
                    Con tu edad, altura, peso y actividad calculamos tu gasto diario y repartimos
                    los macros.
                  </p>
                  <div className="bviz">
                    <div className="goal-grid">
                      <div className="goal-cell">
                        <b style={{ color: "#60a5fa" }}>2.980</b><span>TDEE</span>
                      </div>
                      <div className="goal-cell">
                        <b style={{ color: "var(--green)" }}>2.480</b><span>meta kcal</span>
                      </div>
                      <div className="goal-cell"><b>172 g</b><span>proteína</span></div>
                      <div className="goal-cell"><b>277 g</b><span>carbos</span></div>
                    </div>
                  </div>
                </article>
              </div>

              <div className="privacy reveal">
                <span className="privacy-icon">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <div className="privacy-text">
                  <h3>Tus datos son tuyos</h3>
                  <p>
                    Cada cuenta ve solo sus comidas, pesos y entrenamientos. Las reglas se
                    aplican en la base de datos, no solo en la pantalla.
                  </p>
                </div>
                <div className="privacy-checks">
                  <span className="chip">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Solo vos ves tu historial
                  </span>
                  <span className="chip">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Login con Google
                  </span>
                  <span className="chip">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Podés borrar tu cuenta
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════ EL CHAT ═══════════ */}
          <section className="section" id="chat">
            <div className="container">
              <div className="showcase">
                <div className="showcase-copy reveal">
                  <div className="eyebrow">El asistente</div>
                  <h2 className="section-title">Una foto o una frase. Nada más.</h2>
                  <p className="section-sub">
                    El chat vive al costado del dashboard: no perdés de vista tu día mientras
                    registrás.
                  </p>

                  <ul className="showcase-list">
                    <li>
                      <span className="tick">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span><b>Texto libre:</b> «un café con leche y dos medialunas».</span>
                    </li>
                    <li>
                      <span className="tick">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span><b>Fotos:</b> sacá el plato con la cámara o elegí una imagen.</span>
                    </li>
                    <li>
                      <span className="tick">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span><b>Control:</b> registrás o descartás la estimación con un clic.</span>
                    </li>
                    <li>
                      <span className="tick">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span>
                        <b>Contexto:</b> tiene en cuenta tus dietas y tu país al estimar porciones.
                      </span>
                    </li>
                  </ul>

                  <div className="note">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                    </svg>
                    <span>
                      Es una estimación, no una báscula: el margen ronda el ±30%. Por eso siempre
                      podés revisar y corregir antes de guardar.
                    </span>
                  </div>
                </div>

                <div
                  className="chat-demo reveal"
                  style={{ "--d": ".1s" }}
                  aria-label="Ejemplo de conversación con el asistente"
                >
                  <div className="cd-head">
                    <span className="cd-ai">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
                      </svg>
                    </span>
                    <div>
                      <div className="cd-title">Asistente IA</div>
                      <div className="cd-sub">Nutrición · responde en segundos</div>
                    </div>
                    <span className="cd-badge">— minimizar</span>
                  </div>

                  <div className="cd-body">
                    <div className="cd-msg user">
                      <div className="cd-bubble">Almorcé milanesa con puré y una ensalada</div>
                    </div>

                    <div className="cd-msg ai">
                      <div className="cd-bubble">Buen almuerzo. Te paso la estimación:</div>
                    </div>

                    <div className="cd-est">
                      <div className="cd-est-head">
                        <b>≈ 780 kcal</b>
                        <span>estimación</span>
                      </div>
                      <div className="cd-macros">
                        <div><b>42 g</b>proteína</div>
                        <div><b>68 g</b>carbos</div>
                        <div><b>36 g</b>grasa</div>
                      </div>
                      <div className="cd-actions" aria-hidden="true">
                        <i>Registrar</i><i>Descartar</i>
                      </div>
                    </div>

                    <div className="cd-msg user">
                      <div className="cd-photo" aria-hidden="true" />
                    </div>

                    <div className="cd-msg ai">
                      <div className="cd-bubble">
                        Con la foto veo una porción más grande: ajusté a ≈ 920 kcal y 48 g de
                        proteína.
                      </div>
                    </div>
                  </div>

                  <div className="cd-input" aria-hidden="true">
                    <span className="cd-plus">+</span>
                    <span className="cd-field">Escribí lo que comiste…</span>
                    <span className="cd-send">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════ FAQ ═══════════ */}
          <section className="section" id="faq">
            <div className="container">
              <div className="section-head center reveal">
                <div className="eyebrow">Preguntas frecuentes</div>
                <h2 className="section-title">Lo que probablemente te estés preguntando</h2>
              </div>

              <div className="faq-wrap reveal">
                <div className="faq-item">
                  <details open>
                    <summary>
                      ¿Es gratis?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      Sí. Creás una cuenta con Google o email y ya podés registrar comidas. Si
                      solo querés mirar, hay una <b>cuenta demo</b> con datos de ejemplo para
                      entrar sin registrarte.
                    </div>
                  </details>
                </div>

                <div className="faq-item">
                  <details>
                    <summary>
                      ¿Qué tan precisas son las estimaciones?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      Aproximadas: el margen ronda el <b>±30%</b>. La IA no pesa tu plato ni
                      conoce la receta exacta. Sirve para tener una idea consistente del día, no
                      para competir por el gramo.
                    </div>
                  </details>
                </div>

                <div className="faq-item">
                  <details>
                    <summary>
                      ¿Puedo mandar fotos de la comida?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      Sí. Desde el celular podés <b>sacar la foto en el momento</b> o elegir una
                      de la galería. En la computadora se elige desde archivos. La imagen se
                      comprime antes de subirla.
                    </div>
                  </details>
                </div>

                <div className="faq-item">
                  <details>
                    <summary>
                      ¿Tengo que pesar cada gramo?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      No. Escribís «dos tostadas con queso y un café con leche» y listo. Si
                      querés afinar, podés ajustar la estimación antes de registrarla.
                    </div>
                  </details>
                </div>

                <div className="faq-item">
                  <details>
                    <summary>
                      ¿Sirve si soy vegano o tengo una intolerancia?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      Sí. En tu perfil elegís tus dietas —vegano, vegetariano, pescetariano, sin
                      lactosa, sin gluten, sin frutos secos— y el asistente las tiene en cuenta al
                      estimar.
                    </div>
                  </details>
                </div>

                <div className="faq-item">
                  <details>
                    <summary>
                      ¿Reemplaza a un nutricionista?
                      <span className="faq-plus" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                    </summary>
                    <div className="faq-a">
                      No. Es una herramienta de <b>seguimiento personal</b>. Si necesitás un plan
                      clínico o tenés una condición médica, consultá con un profesional.
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════ CTA FINAL ═══════════ */}
          <section className="cta-final">
            <div className="container">
              <div className="cta-card reveal">
                <h2>
                  Tu próxima comida ya cuenta.
                  <br />
                  Empezá hoy.
                </h2>
                <p>
                  Creá tu cuenta en menos de un minuto o mirá primero la demo con datos de
                  ejemplo.
                </p>
                <div className="cta-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => openAuth("register")}
                  >
                    Crear cuenta gratis
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-lg"
                    onClick={handleDemo}
                    disabled={demoBusy}
                  >
                    <span className="dot" aria-hidden="true" />
                    {demoBusy ? "Entrando…" : "Probar la demo"}
                  </button>
                </div>
                <p className="cta-note">Sin tarjeta. Sin descargas. Funciona en el navegador.</p>
              </div>
            </div>
          </section>
        </main>

        {/* ═══════════ FOOTER ═══════════ */}
        <footer className="site-foot">
          <div className="container">
            <div className="foot-grid">
              <div className="foot-brand">
                <a className="brand" href="#top">
                  <span className="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none">
                      <rect x="3" y="18" width="5" height="10" rx="1.5" fill="#3b82f6" />
                      <rect x="10.5" y="12" width="5" height="16" rx="1.5" fill="#22c55e" />
                      <rect x="18" y="16" width="5" height="12" rx="1.5" fill="#a855f7" />
                      <rect x="25.5" y="7" width="5" height="21" rx="1.5" fill="#14b8a6" />
                    </svg>
                  </span>
                  <span className="brand-name">
                    Health<span>Dashboard</span>
                  </span>
                </a>
                <p>
                  Nutrición y entrenamiento, simple. Un proyecto personal para seguir comidas,
                  macros y peso sin planillas.
                </p>
              </div>

              <div className="foot-links">
                <div className="foot-col">
                  <h4>Producto</h4>
                  <a href="#como">Cómo funciona</a>
                  <a href="#funciones">Funciones</a>
                  <a href="#chat">El asistente</a>
                </div>
                <div className="foot-col">
                  <h4>Cuenta</h4>
                  <button type="button" onClick={() => openAuth("login")}>Entrar</button>
                  <button type="button" onClick={() => openAuth("register")}>Crear cuenta</button>
                  <a href="#faq">Preguntas</a>
                </div>
                <div className="foot-col">
                  <h4>Proyecto</h4>
                  <a
                    href="https://github.com/nelsoncabrera06/Health-Dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub
                  </a>
                  <a
                    href="https://nutritiondashboard.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    App en vivo
                  </a>
                </div>
              </div>
            </div>

            <div className="foot-bottom">
              <span>© 2026 Health Dashboard. Hecho por Nelson Cabrera.</span>
              <span>Las estimaciones son aproximadas y no reemplazan asesoramiento médico.</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Fuera de .landing para no heredar sus estilos base (a, button). */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
      />
    </>
  );
}
