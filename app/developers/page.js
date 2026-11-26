import Link from "next/link";
import CopyCode from "../../components/CopyCode";
import "./developers.css";

export const metadata = {
  title: "API y MCP para agentes — Nutrition Dashboard",
  description:
    "Leé y registrá comidas, pesos y entrenamientos desde Claude Code, OpenClaw, Hermes o cualquier cliente HTTP. REST y MCP con API keys por usuario.",
};

// Los snippets apuntan a prod. En local el host es http://localhost:3100.
const SITE = "https://nutritiondashboard.vercel.app";
const MCP_URL = `${SITE}/api/mcp`;

const TOOLS = [
  {
    name: "get_profile",
    what: "Perfil, objetivos diarios, TDEE y zona horaria",
    scope: "health:read",
  },
  {
    name: "get_day_summary",
    what: "Totales del día: macros, ejercicios, restante y balance neto",
    scope: "health:read",
  },
  {
    name: "list_meals",
    what: "Comidas de un rango de días (default: últimos 7)",
    scope: "health:read",
  },
  {
    name: "list_weights",
    what: "Pesajes de un rango de días (default: últimos 30)",
    scope: "health:read",
  },
  {
    name: "list_workouts",
    what: "Entrenamientos de un rango (default: últimos 7)",
    scope: "health:read",
  },
  {
    name: "add_meal",
    what: "Registra una comida con los macros ya estimados",
    scope: "meals:write",
  },
  {
    name: "log_weight",
    what: "Registra el peso del día (uno por día, pisa el anterior)",
    scope: "weights:write",
  },
  {
    name: "log_workout",
    what: "Registra un entrenamiento con duración y calorías",
    scope: "workouts:write",
  },
];

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/ping", what: "Prueba de conexión", scope: "health:read" },
  { method: "GET", path: "/api/v1/me", what: "Perfil y objetivos", scope: "health:read" },
  { method: "GET", path: "/api/v1/summary", what: "Resumen del día", scope: "health:read" },
  { method: "GET", path: "/api/v1/meals", what: "Comidas del rango", scope: "health:read" },
  { method: "POST", path: "/api/v1/meals", what: "Registrar comida", scope: "meals:write" },
  { method: "GET", path: "/api/v1/weights", what: "Pesajes del rango", scope: "health:read" },
  { method: "POST", path: "/api/v1/weights", what: "Registrar peso (upsert)", scope: "weights:write" },
  { method: "GET", path: "/api/v1/workouts", what: "Entrenamientos del rango", scope: "health:read" },
  { method: "POST", path: "/api/v1/workouts", what: "Registrar entrenamiento", scope: "workouts:write" },
];

const CURL_READ = `curl -s "${SITE}/api/v1/me?pretty=1" \\
  -H "Authorization: Bearer hd_live_xxxxxxxx"`;

const CURL_WRITE = `curl -s -X POST "${SITE}/api/v1/meals?pretty=1" \\
  -H "Authorization: Bearer hd_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Milanesa con puré","calories":780,
       "protein":42,"carbs":68,"fat":36,"client_ref":"demo-1"}'`;

const CLAUDE_CODE = `claude mcp add --transport http nutrition \\
  ${MCP_URL} \\
  --header "Authorization: Bearer hd_live_xxxxxxxx"`;

const JSON_CONFIG = `{
  "mcpServers": {
    "health": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer hd_live_xxxxxxxx"
      }
    }
  }
}`;

export default function DevelopersPage() {
  return (
    <div className="dev">
      <header className="dev-head">
        <div className="dev-wrap dev-head-inner">
          <Link href="/" className="dev-brand">
            <span className="dev-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <rect x="3" y="18" width="5" height="10" rx="1.5" fill="#3b82f6" />
                <rect x="10.5" y="12" width="5" height="16" rx="1.5" fill="#22c55e" />
                <rect x="18" y="16" width="5" height="12" rx="1.5" fill="#a855f7" />
                <rect x="25.5" y="7" width="5" height="21" rx="1.5" fill="#14b8a6" />
              </svg>
            </span>
            Nutrition<span>Dashboard</span>
          </Link>
          <nav className="dev-nav">
            <a href="#tools">Tools</a>
            <a href="#rest">REST</a>
            <a href="#conectar">Conectar</a>
            <Link href="/api-keys" className="dev-btn dev-btn-primary">
              Crear mi API key
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="dev-hero">
          <div className="dev-wrap">
            <span className="dev-badge">Para agentes y scripts</span>
            <h1>
              Tu data de salud,
              <br />
              <span className="dev-grad">disponible para tu agente.</span>
            </h1>
            <p className="dev-lead">
              Nutrition Dashboard expone lo mismo que ves en la web —comidas, pesos,
              entrenamientos y objetivos— por dos puertas: <b>MCP</b> para agentes que
              hablan el protocolo (Claude Code, OpenClaw, Hermes) y una <b>API REST</b>
              para scripts y <code>curl</code>. Cada usuario tiene sus propias keys, con
              sus propios permisos.
            </p>
            <div className="dev-cta">
              <Link href="/api-keys" className="dev-btn dev-btn-primary dev-btn-lg">
                Crear mi API key
              </Link>
              <a href="#conectar" className="dev-btn dev-btn-ghost dev-btn-lg">
                Ver cómo conectar
              </a>
            </div>
            <p className="dev-fine">
              La documentación es pública. Crear una key requiere cuenta: las keys van
              atadas a un usuario, no son globales.
            </p>
          </div>
        </section>

        {/* QUÉ SE PUEDE HACER */}
        <section className="dev-section">
          <div className="dev-wrap">
            <h2 className="dev-h2">Qué puede hacer un agente</h2>
            <div className="dev-grid-4">
              {[
                ["📊", "Leer tu día", "Macros consumidos, objetivos, lo que falta y el balance neto."],
                ["🍽️", "Registrar comidas", "Con los macros que el agente estima, no los nuestros."],
                ["⚖️", "Cargar el peso", "Un registro por día: si repite, pisa el anterior."],
                ["🏃", "Cargar entrenamientos", "Tipo, duración y calorías quemadas."],
              ].map(([icon, title, text]) => (
                <div className="dev-card" key={title}>
                  <span className="dev-icon" aria-hidden="true">{icon}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TOOLS MCP */}
        <section className="dev-section" id="tools">
          <div className="dev-wrap">
            <h2 className="dev-h2">Tools del servidor MCP</h2>
            <p className="dev-sub">
              Ocho herramientas. El agente las descubre solo con conectarse: cada una
              trae su descripción, sus unidades y qué permiso necesita.
            </p>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Qué hace</th>
                    <th>Permiso</th>
                  </tr>
                </thead>
                <tbody>
                  {TOOLS.map((t) => (
                    <tr key={t.name}>
                      <td><code>{t.name}</code></td>
                      <td>{t.what}</td>
                      <td><span className="dev-scope">{t.scope}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="dev-note">
              Si falta el permiso, la tool responde con un error legible
              (“falta <code>meals:write</code>”), no con un 500. El agente puede pedirte
              una key nueva en vez de quedarse trabado.
            </p>
          </div>
        </section>

        {/* REST */}
        <section className="dev-section" id="rest">
          <div className="dev-wrap">
            <h2 className="dev-h2">API REST</h2>
            <p className="dev-sub">
              Para scripts, cron y clientes que no hablan MCP. Todas responden{" "}
              <code>{"{ data, meta }"}</code> y los errores{" "}
              <code>{"{ error, code }"}</code>. Agregá <code>?pretty=1</code> para ver el
              JSON indentado.
            </p>
            <div className="dev-table-wrap">
              <table className="dev-table">
                <thead>
                  <tr>
                    <th>Método</th>
                    <th>Ruta</th>
                    <th>Qué hace</th>
                    <th>Permiso</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={`${e.method}-${e.path}`}>
                      <td>
                        <span className={`dev-method ${e.method === "GET" ? "get" : "post"}`}>
                          {e.method}
                        </span>
                      </td>
                      <td><code>{e.path}</code></td>
                      <td>{e.what}</td>
                      <td><span className="dev-scope">{e.scope}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CONECTAR */}
        <section className="dev-section" id="conectar">
          <div className="dev-wrap">
            <h2 className="dev-h2">Cómo conectar</h2>
            <ol className="dev-steps">
              <li>
                <b>Creá una key</b> en{" "}
                <Link href="/api-keys">API keys</Link>. Elegí los permisos y el
                vencimiento (90 días, 6 meses o 1 año). El token se muestra{" "}
                <b>una sola vez</b>: en la base solo queda su hash.
              </li>
              <li>
                <b>Pegala en la configuración del agente</b> como{" "}
                <code>Authorization: Bearer …</code>. Es la contraseña del programa:
                no la subas a GitHub.
              </li>
              <li>
                <b>Pedile que empiece por el perfil</b> (<code>get_profile</code>): ahí
                están tus objetivos y tu zona horaria, que es la que define qué es “hoy”.
              </li>
            </ol>

            <div className="dev-snippets">
              <CopyCode label="Claude Code (MCP)" code={CLAUDE_CODE} />
              <CopyCode label="Clientes MCP tipo JSON" code={JSON_CONFIG} />
              <CopyCode label="curl — leer el perfil" code={CURL_READ} />
              <CopyCode label="curl — registrar una comida" code={CURL_WRITE} />
            </div>

            <p className="dev-note">
              En zsh la URL va <b>entre comillas</b> si tiene <code>?</code>, porque el signo es
              comodín y la shell corta antes de ejecutar <code>curl</code>.
            </p>
          </div>
        </section>

        {/* LÍMITES Y REGLAS */}
        <section className="dev-section">
          <div className="dev-wrap">
            <h2 className="dev-h2">Límites y reglas</h2>
            <div className="dev-grid-3">
              <div className="dev-card">
                <h3>Plan free</h3>
                <p>
                  1 key activa y 1.000 pedidos por día. Revocar o eliminar una key libera
                  el lugar; los planes con más keys están previstos.
                </p>
              </div>
              <div className="dev-card">
                <h3>Permisos granulares</h3>
                <p>
                  Leer siempre está incluido. Escribir comida, peso o entrenamiento se
                  habilita por separado, así un agente de consulta no puede modificar
                  nada.
                </p>
              </div>
              <div className="dev-card">
                <h3>Revocar es definitivo</h3>
                <p>
                  Una key revocada o vencida no vuelve a funcionar. Si la necesitás otra
                  vez, creás una nueva. Eliminar la borra del todo.
                </p>
              </div>
              <div className="dev-card">
                <h3>Sin borrado por API</h3>
                <p>
                  Las keys pueden leer y registrar, nunca borrar. Borrar comidas, pesos o
                  la cuenta se hace desde la web, con confirmación.
                </p>
              </div>
              <div className="dev-card">
                <h3>La cuenta demo no tiene keys</h3>
                <p>
                  Es pública: cualquiera entra con un botón. Si pudiera crear keys, la API
                  sería escritura abierta a internet.
                </p>
              </div>
              <div className="dev-card">
                <h3>Tus datos son tuyos</h3>
                <p>
                  Cada key ve solo los datos de su dueño. Los filtros por usuario están en
                  el servidor, en cada consulta.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* AVISO DE ESTIMACIÓN */}
        <section className="dev-section">
          <div className="dev-wrap">
            <div className="dev-warning">
              <h3>Sobre los macros: los estima el agente, no la API</h3>
              <p>
                La API <b>no calcula</b> calorías ni macros: guarda lo que le mandan. El
                chat de la web usa nuestro modelo y ronda el ±30% de error; con un agente,
                la precisión depende del modelo que uses del otro lado. Sirve para tener
                una idea consistente del día, no para competir por el gramo.
              </p>
            </div>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="dev-final">
          <div className="dev-wrap">
            <h2>¿Conectamos tu agente?</h2>
            <p>
              Creá una key, pegala en la configuración y pedile que lea tu día. Se tarda
              menos que cargar una comida a mano.
            </p>
            <div className="dev-cta">
              <Link href="/api-keys" className="dev-btn dev-btn-primary dev-btn-lg">
                Crear mi API key
              </Link>
              <Link href="/" className="dev-btn dev-btn-ghost dev-btn-lg">
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="dev-foot">
        <div className="dev-wrap dev-foot-inner">
          <span>© 2026 Nutrition Dashboard. Hecho por Nelson Cabrera.</span>
          <span>
            Las estimaciones son aproximadas y no reemplazan asesoramiento médico.
          </span>
        </div>
      </footer>
    </div>
  );
}
