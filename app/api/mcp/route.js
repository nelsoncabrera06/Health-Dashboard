// Servidor MCP (Model Context Protocol) para agentes.
//
// Transport: *streamable HTTP* en modo **stateless**. En Vercel cada request
// puede caer en otra instancia, así que no hay memoria compartida entre
// llamadas: se crea un server + transport por request y `sessionIdGenerator`
// va en `undefined` (sin `Mcp-Session-Id`).
//
// Auth: el mismo `authenticate()` que la API REST. Acepta `hd_live_...` (con
// sus scopes) o el access token de Supabase. 401 con `WWW-Authenticate: Bearer`
// para que el cliente sepa cómo reintentar.
//
// Las descripciones de las tools son el prompt: unidades, formato de fecha,
// zona horaria del usuario y la orden de no registrar sin confirmar. El agente
// estima los macros; acá solo se valida y se guarda.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { authenticate, hasScope } from "../../../lib/api/auth";
import {
  addMeal,
  addWorkout,
  dateInTz,
  getDaySummary,
  getProfileData,
  listMeals,
  listWeights,
  listWorkouts,
  upsertWeight,
} from "../../../lib/api/data";
import { parseMeal, parseWeight, parseWorkout } from "../../../lib/api/payloads";
import { isDate } from "../../../lib/api/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_HINT = "Formato YYYY-MM-DD.";
const ISO_HINT =
  "Fecha ISO 8601 con zona, ej. 2026-11-21T13:30:00-03:00. Si se omite, es ahora.";

// Resultado de una tool: JSON legible por el modelo.
function json(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

// Error de negocio (validación, scope, fecha): el agente lo lee y corrige.
// No es un 500: el servidor funcionó, el pedido estaba mal.
function toolError(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

function scopeError(scope) {
  return toolError(
    `Falta el permiso "${scope}" en esta API key. Pedile al usuario que cree una key con ese permiso en la web (API keys).`
  );
}

// Valida una fecha de query de las tools de lectura.
function readDate(value, timezone, label = "date") {
  if (value && !isDate(value))
    return { ok: false, message: `"${label}" inválida: ${DATE_HINT}` };
  return { ok: true, date: value || dateInTz(timezone) };
}

function buildServer(auth) {
  const server = new McpServer(
    { name: "nutrition-dashboard", version: "1.0.0" },
    {
      instructions:
        "API de seguimiento nutricional personal. Unidades: calorías en kcal, macros en gramos, peso en kg, duración en minutos. " +
        "Las fechas son del usuario, no de UTC: usá la zona horaria que devuelve get_profile. " +
        "En las tools de escritura, no registres nada sin que el usuario lo confirme antes.",
    }
  );

  // ── Lectura ────────────────────────────────────────────────
  server.registerTool(
    "get_profile",
    {
      title: "Perfil del usuario",
      description:
        "Devuelve el perfil: datos personales, objetivo (pérdida de grasa, volumen, etc.), objetivos diarios (targets de calorías y macros), TDEE, dietas, suplementos habituales y la zona horaria con la que se calculan los días. Llamala primero para saber en qué unidades y zona trabajar.",
      inputSchema: {},
    },
    async () => {
      if (!hasScope(auth, "health:read")) return scopeError("health:read");
      const profile = await getProfileData(auth.userId);
      return json({
        ...profile,
        today: dateInTz(profile.timezone),
      });
    }
  );

  server.registerTool(
    "get_day_summary",
    {
      title: "Resumen del día",
      description:
        "Totales del día: comidas, ejercicios, macros consumidos, objetivos, lo que falta y el balance neto (comido menos quemado). Sin fecha devuelve hoy en la zona del usuario.",
      inputSchema: {
        date: z.string().optional().describe(`Día a consultar. ${DATE_HINT} Vacío = hoy.`),
      },
    },
    async ({ date }) => {
      if (!hasScope(auth, "health:read")) return scopeError("health:read");
      const profile = await getProfileData(auth.userId);
      const day = readDate(date, profile.timezone);
      if (!day.ok) return toolError(day.message);
      const summary = await getDaySummary(auth.userId, day.date);
      return json(summary);
    }
  );

  server.registerTool(
    "list_meals",
    {
      title: "Listar comidas",
      description:
        "Comidas registradas en un rango de días (inclusive). Sin fechas devuelve los últimos 7 días. Devuelve también el rango efectivo y la zona horaria usada.",
      inputSchema: {
        from: z.string().optional().describe(`Primer día del rango. ${DATE_HINT}`),
        to: z.string().optional().describe(`Último día del rango. ${DATE_HINT}`),
        limit: z.number().int().min(1).max(500).optional().describe("Máximo de filas (default 200)."),
      },
    },
    async ({ from, to, limit }) => {
      if (!hasScope(auth, "health:read")) return scopeError("health:read");
      const profile = await getProfileData(auth.userId);
      const res = await listMeals(auth.userId, {
        from,
        to,
        timezone: profile.timezone,
        limit: limit || 200,
      });
      return json({
        timezone: res.timezone,
        from: res.from,
        to: res.to,
        count: res.meals.length,
        meals: res.meals,
      });
    }
  );

  server.registerTool(
    "list_weights",
    {
      title: "Listar pesajes",
      description:
        "Pesajes registrados en un rango de días (inclusive). Sin fechas devuelve los últimos 30 días. Hay como máximo un registro por día.",
      inputSchema: {
        from: z.string().optional().describe(`Primer día del rango. ${DATE_HINT}`),
        to: z.string().optional().describe(`Último día del rango. ${DATE_HINT}`),
      },
    },
    async ({ from, to }) => {
      if (!hasScope(auth, "health:read")) return scopeError("health:read");
      const profile = await getProfileData(auth.userId);
      const res = await listWeights(auth.userId, { from, to });
      return json({
        timezone: profile.timezone,
        from: res.from,
        to: res.to,
        count: res.weights.length,
        weights: res.weights,
      });
    }
  );

  server.registerTool(
    "list_workouts",
    {
      title: "Listar entrenamientos",
      description:
        "Entrenamientos registrados en un rango de días (inclusive). Sin fechas devuelve los últimos 7 días.",
      inputSchema: {
        from: z.string().optional().describe(`Primer día del rango. ${DATE_HINT}`),
        to: z.string().optional().describe(`Último día del rango. ${DATE_HINT}`),
      },
    },
    async ({ from, to }) => {
      if (!hasScope(auth, "health:read")) return scopeError("health:read");
      const profile = await getProfileData(auth.userId);
      const res = await listWorkouts(auth.userId, {
        from,
        to,
        timezone: profile.timezone,
      });
      return json({
        timezone: res.timezone,
        from: res.from,
        to: res.to,
        count: res.workouts.length,
        workouts: res.workouts,
      });
    }
  );

  // ── Escritura ──────────────────────────────────────────────
  server.registerTool(
    "add_meal",
    {
      title: "Registrar una comida",
      description:
        "Registra una comida con los macros ya estimados por vos (calorías en kcal, macros en gramos). No inventes valores: si no podés estimar con confianza, preguntá al usuario. Confirmá con el usuario antes de registrar. Mandá SIEMPRE un client_ref único por comida (ej. 'milanesa-pure-2026-11-22-1'): si la llamada se reintenta con el mismo valor, no se duplica. Devuelve la fila creada y el resumen del día recalculado.",
      inputSchema: {
        name: z.string().min(1).max(120).describe("Qué comió, en texto libre (ej. 'Milanesa con puré')."),
        calories: z.number().min(0).max(10000).describe("Calorías totales de la comida (kcal)."),
        protein: z.number().min(0).max(2000).optional().describe("Proteína en gramos."),
        carbs: z.number().min(0).max(2000).optional().describe("Carbohidratos en gramos."),
        fat: z.number().min(0).max(2000).optional().describe("Grasas en gramos."),
        eaten_at: z.string().optional().describe(ISO_HINT),
        client_ref: z
          .string()
          .max(64)
          .optional()
          .describe(
            "Mandalo siempre. Identificador único de ESTA comida (ej. 'milanesa-pure-2026-11-22-1'): si el request se reintenta con el mismo valor, el servidor devuelve la comida que ya existe marcada como duplicated en vez de crear otra."
          ),
      },
    },
    async (args) => {
      if (!hasScope(auth, "meals:write")) return scopeError("meals:write");
      const checked = parseMeal(args);
      if (!checked.ok) return toolError(checked.message);

      const { meal, duplicated } = await addMeal(auth.userId, checked.values);
      const profile = await getProfileData(auth.userId);
      const date = dateInTz(profile.timezone, new Date(meal.eaten_at));
      const day = await getDaySummary(auth.userId, date);

      return json({
        meal,
        duplicated,
        day,
        note: duplicated
          ? "Esa comida ya estaba registrada (mismo client_ref): no se duplicó. Es la misma fila."
          : "Comida registrada.",
      });
    }
  );

  server.registerTool(
    "log_weight",
    {
      title: "Registrar el peso",
      description:
        "Registra el peso del día en kg. Hay un solo registro por día: si ya existe, lo pisa. Sin fecha usa hoy en la zona del usuario. Confirmá con el usuario antes de registrar.",
      inputSchema: {
        weight_kg: z.number().min(20).max(400).describe("Peso en kilogramos."),
        measured_at: z.string().optional().describe(`Día del pesaje. ${DATE_HINT} Vacío = hoy.`),
      },
    },
    async (args) => {
      if (!hasScope(auth, "weights:write")) return scopeError("weights:write");
      const checked = parseWeight(args);
      if (!checked.ok) return toolError(checked.message);

      const profile = await getProfileData(auth.userId);
      const measuredAt = checked.values.measuredAt || dateInTz(profile.timezone);
      const weight = await upsertWeight(auth.userId, {
        weightKg: checked.values.weightKg,
        measuredAt,
      });
      return json({ weight, note: "Peso registrado (si ya había uno ese día, se reemplazó)." });
    }
  );

  server.registerTool(
    "log_workout",
    {
      title: "Registrar un entrenamiento",
      description:
        "Registra un entrenamiento: tipo, duración en minutos y calorías quemadas estimadas. Confirmá con el usuario antes de registrar.",
      inputSchema: {
        type: z.string().min(1).max(60).describe("Tipo de entrenamiento (ej. running, gym, caminata, bici)."),
        duration_min: z.number().min(0).max(1440).optional().describe("Duración en minutos."),
        calories_burned: z.number().min(0).max(10000).optional().describe("Calorías quemadas (kcal)."),
        notes: z.string().max(500).optional().describe("Notas libres."),
        started_at: z.string().optional().describe(ISO_HINT),
      },
    },
    async (args) => {
      if (!hasScope(auth, "workouts:write")) return scopeError("workouts:write");
      const checked = parseWorkout(args);
      if (!checked.ok) return toolError(checked.message);

      const workout = await addWorkout(auth.userId, checked.values);
      return json({ workout, note: "Entrenamiento registrado." });
    }
  );

  return server;
}

function unauthorized(code, message) {
  return Response.json(
    { error: message, code },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        // Para que el cliente MCP sepa que tiene que mandar un Bearer.
        "WWW-Authenticate": 'Bearer realm="nutrition-dashboard"',
      },
    }
  );
}

export async function POST(req) {
  const auth = await authenticate(req);
  if (!auth.ok) return unauthorized(auth.code, auth.message);

  // Server + transport por request: en stateless no hay nada que reutilizar y
  // `connect()` solo se puede llamar una vez por server.
  const server = buildServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: sin Mcp-Session-Id
    enableJsonResponse: true, // respuesta JSON simple, sin SSE
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (e) {
    return Response.json(
      { error: e?.message || "Error interno del servidor MCP.", code: "internal" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    // Libera los listeners del transport; el server se descarta con el request.
    await server.close().catch(() => {});
  }
}

// Stateless no tiene stream que reabrir (GET) ni sesión que cerrar (DELETE).
export async function GET() {
  return Response.json(
    {
      error: "Este servidor MCP es stateless: usá POST con JSON-RPC.",
      code: "method_not_allowed",
    },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}

export async function DELETE() {
  return Response.json(
    { error: "Este servidor MCP es stateless: no hay sesión que cerrar.", code: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }
  );
}
