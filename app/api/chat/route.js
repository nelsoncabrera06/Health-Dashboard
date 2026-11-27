import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { complete } from "../../../lib/ai";
import { serviceClient } from "../../../lib/api/service";
import { parseAssistantText, weightFromUserMessage } from "../../../lib/chatParse";
import { limitsFor, DEMO_CHAT_MESSAGES_PER_DAY } from "../../../lib/api/tiers";
import { dateInTz, DEFAULT_TZ } from "../../../lib/api/data";
import { transcribe } from "../../../lib/stt";

// Chat de texto multi-provider (ver lib/ai.js: AI_PROVIDER=openrouter|gemini).
// Las API keys viven solo en el servidor. El cliente manda su access token
// (Bearer) y acá se valida contra Supabase.
// El cliente se crea por request: a nivel módulo rompería el build si faltan
// las env vars (Vercel evalúa el módulo en "Collecting page data").
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

// El cupo del chat sale del TIER del perfil (`lib/api/tiers.js`), no del rol:
// free 30, pro 100, premium 500. La demo es la excepción, porque es un rol
// público y compartido con un cupo de prueba chico.
// Rate limit simple en memoria: userId -> { day, count }.
const usage = new Map();

const SYSTEM = `Sos el asistente de nutrición de Nutrition Dashboard. Hablás español rioplatense, tono tranqui y corto.

ALCANCE: solo nutrición y deporte. Comidas, bebidas, calorías, macros, porciones, planificación de comidas, peso corporal y entrenamiento/actividad física.
Todo lo demás está fuera de alcance. Si te preguntan algo distinto (clima, hora, política, noticias, chistes, programación, matemática suelta, o cualquier dato general), NO contestes la pregunta: respondé una sola línea corta avisando que estás para nutrición y deporte, y una pregunta que vuelva al tema. No des esa información "de paso" ni como ejemplo: si la das, el usuario sigue preguntando y se van los tokens.
Ejemplos de desvío: "Eso se me escapa: estoy para comidas, macros y entrenamiento. ¿Qué comiste hoy?" / "De eso no opino. Contame qué desayunaste y te tiro los macros."
Saludos y cortesías: una línea y ofrecé estimar una comida.
Estimá solo cuando el usuario te cuenta qué comió o bebió, o cuando pregunta por un alimento puntual. Si el mensaje es un comentario sobre una estimación que ya diste (sorpresa, "es una locura", "es mucho", agradecimiento, chiste), NO repitas la línea ESTIMACIÓN: contestá en texto corto y listo.
Cuando el usuario te cuenta qué comió, estimá calorías y macros (proteína, carbos, grasas en gramos).
Si falta info (porciones, ingredientes), igual estimá con supuestos razonables y avisalo en una línea.
Si te pregunta si podés registrar, anotar o guardar una comida o el peso: la app tiene un botón "Registrar" debajo de tu respuesta (en la tarjeta de comida o en la de peso), así que NO digas que no podés. Contestá que con ese botón queda guardado en el día. Nunca menciones herramientas, funciones ni bases de datos.
Si el usuario adjunta una foto de su comida, describí en una línea qué ves en el plato y estimá desde la imagen. La foto siempre llega bien al modelo: nunca digas que no ves ninguna foto.
Las notas de voz llegan transcriptas a texto, así que el mensaje puede venir sin puntuación o con errores de reconocimiento: interpretá la intención igual y respondé con el mismo formato que con texto (ESTIMACIÓN o PESO). Nunca digas que no podés escuchar audio ni que no recibiste la nota.
Si te preguntan qué modelo de AI sos, quién te desarrolló o de qué empresa sos, no especules ni inventes marcas: sos el asistente de Nutrition Dashboard y la marca del modelo no es un dato que puedas dar.
IMPORTANTE: siempre que haya una estimación, cerrá tu respuesta con una línea separada con este formato exacto:
ESTIMACIÓN: {"meal": "nombre corto", "calories": N, "protein": N, "carbs": N, "fat": N}
Si el usuario mencionó cualquier comida o bebida, esa línea es obligatoria. Escribí todo en texto plano, sin markdown: nada de asteriscos, negritas, guiones bajos ni backticks.
Peso corporal: cuando el usuario cuente cuánto pesa, diga que se pesó o pida registrar su peso, contestá en una o dos líneas y cerrá con una línea aparte con este formato exacto:
PESO: {"weight": N}
N es el peso en kg, solo el número (ej. 113.5, con punto). Esa línea va sola, sin texto en el mismo renglón y sin markdown.
Cuenta cualquier forma de decirlo, no hace falta que use la palabra "peso": "me pesé 113,5", "hoy estoy en 113,5 kg", "la balanza marcó 113,5", "ando en 113", "peso 113,5 kg". Si cuenta que se pesó o pide registrarlo, la línea es OBLIGATORIA aunque ya haya dado el número antes o venga con errores de tipeo.
Nunca digas que ya registraste, guardaste, anotaste o que "tenés" el peso guardado: el registro lo hace el usuario con el botón "Registrar" de la tarjeta que aparece debajo. Si pide registrar un peso que ya mencionó antes, volvé a emitir la línea con ese valor. Si solo comenta el peso de una tarjeta ya mostrada ("sigo igual", "bajé un poco"), no repitas la línea.
Aclaración: son estimaciones aproximadas, no consejo médico.`;

// El "día" del cupo es el del usuario, no UTC: si no, a las 21:00 de Argentina
// el contador arrancaría de cero y el cupo sería de 14 mensajes por día real.
function todayKey(timeZone) {
  try {
    return dateInTz(timeZone || DEFAULT_TZ);
  } catch {
    return dateInTz(DEFAULT_TZ);
  }
}

// La demo es una cuenta pública y compartida (un solo user_id). Para que cada
// visitante tenga su propio cupo, el contador de la demo se lleva por cookie
// httpOnly: 7 mensajes por navegador/día. Los usuarios registrados siguen por
// user_id. La cookie se emite en la primera respuesta y dura 1 día.
const DEMO_COOKIE = "hd_demo_sid";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function demoCookie(req, id) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${DEMO_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`;
}

// IP del cliente (Vercel setea x-forwarded-for). Solo se usa para el fallback
// de la demo cuando el cliente no manda cookie.
function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

async function authenticateUser(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "No autenticado.", status: 401 };

  const supabase = getSupabase();
  if (!supabase) {
    return { error: "Falta configurar Supabase en el servidor.", status: 500 };
  }
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { error: "Sesión inválida.", status: 401 };

  // El cupo del chat va atado al TIER (free/pro/premium). La demo es la única
  // excepción porque es un rol, no un tier.
  const db = serviceClient();
  const { data: profile } = db
    ? await db
        .from("profiles")
        .select("role, tier, timezone")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isDemo = profile?.role === "demo";
  const tier = profile?.tier || "free";
  const limit = isDemo
    ? DEMO_CHAT_MESSAGES_PER_DAY
    : limitsFor(tier).chatMessagesPerDay;

  // Clave del rate limit: user_id para los registrados, cookie para la demo.
  // Sin cookie (scripts, clientes raros) la demo cae a la IP, así que no se
  // estrena cupo con solo ignorar el Set-Cookie.
  let key = user.id;
  let newDemoId = null;
  if (isDemo) {
    let sid = readCookie(req, DEMO_COOKIE);
    if (sid && !UUID_RE.test(sid)) sid = null;
    if (!sid) {
      sid = randomUUID();
      newDemoId = sid;
      key = `demo:ip:${clientIp(req)}`;
    } else {
      key = `demo:sid:${sid}`;
    }
  }

  const day = todayKey(profile?.timezone);
  // La demo suma una entrada por visitante: si el Map crece, se purgan los días
  // viejos (el cupo vence a las 00:00 del usuario).
  if (usage.size > 5000) {
    for (const [k, v] of usage) if (v.day !== day) usage.delete(k);
  }
  const u = usage.get(key);
  const used = u && u.day === day ? u.count : 0;
  const remaining = Math.max(0, limit - used);

  return { user, key, isDemo, tier, limit, used, remaining, day, u, newDemoId };
}

export async function GET(req) {
  const auth = await authenticateUser(req);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }
  const res = Response.json({
    used: auth.used,
    limit: auth.limit,
    remaining: auth.remaining,
    isDemo: auth.isDemo,
    tier: auth.tier,
  });
  if (auth.newDemoId) res.headers.append("Set-Cookie", demoCookie(req, auth.newDemoId));
  return res;
}

export async function POST(req) {
  const auth = await authenticateUser(req);
  if (auth.error) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { key, isDemo, tier, limit, used, day, newDemoId } = auth;
  // Toda respuesta del POST lleva la cookie de la demo cuando es nueva, errores
  // incluidos: si no, cada intento fallido estrenaría un cupo distinto.
  const reply = (body, status = 200) => {
    const res = Response.json(body, { status });
    if (newDemoId) res.headers.append("Set-Cookie", demoCookie(req, newDemoId));
    return res;
  };

  if (used >= limit) {
    return reply(
      isDemo
        ? {
            error: `Alcanzaste el límite de prueba (${limit} mensajes por día). Creá tu cuenta para seguir usando el asistente.`,
            code: "demo_limit",
            limit,
            used,
            remaining: 0,
          }
        : {
            error: `Límite diario del chat alcanzado (${limit} mensajes). Probá mañana.`,
            code: "rate_limited",
            limit,
            used,
            remaining: 0,
          },
      429
    );
  }

  let body;  try {
    body = await req.json();
  } catch {
    return reply({ error: "Body inválido." }, 400);
  }
  const messages = Array.isArray(body?.messages)
    ? body.messages
        .filter(
          (m) =>
            m &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant")
        )
        .slice(-20)
    : null;
  if (!messages || !messages.length)
    return reply({ error: "Sin mensajes." }, 400);

  // Visión (paso 11): la foto llega como data URL (el cliente la comprime).
  // El historial se manda solo texto; la imagen va aparte al provider.
  const image =
    typeof body?.image === "string" && body.image.startsWith("data:image/")
      ? body.image
      : null;
  if (typeof body?.image === "string" && !image)
    return reply({ error: "La foto llegó en un formato inválido." }, 400);

  // Nota de voz (estilo Telegram): audio en data URL base64.
  const audio =
    typeof body?.audio === "string" && body.audio.startsWith("data:audio/")
      ? body.audio
      : null;
  if (typeof body?.audio === "string" && !audio)
    return reply({ error: "El audio llegó en un formato inválido." }, 400);

  const last = messages[messages.length - 1];
  if (image && last.role === "user" && !last.content.trim())
    last.content = "Describí qué ves en la foto y estimá calorías y macros.";

  // El audio se transcribe antes de llamar al modelo, así la voz funciona con
  // cualquier provider/modelo (antes solo Gemini aceptaba audio nativo).
  // El transcript viaja al cliente para mostrarlo en la burbuja.
  let transcript = null;
  if (audio) {
    try {
      transcript = (await transcribe(audio)).text;
    } catch (e) {
      return reply({ error: e.message, code: e.code || "stt_failed" }, e.status || 502);
    }
    if (last.role === "user") {
      const caption = last.content.trim();
      last.content = caption ? `${caption}\n${transcript}` : transcript;
    }
  }

  const t = body?.targets;
  // Preferencias alimentarias del onboarding (llegan como labels ya legibles).
  const diet = Array.isArray(body?.diet)
    ? body.diet
        .filter((d) => typeof d === "string" && d.trim())
        .map((d) => d.trim().slice(0, 40))
        .slice(0, 10)
    : [];
  const supplements = Array.isArray(body?.supplements)
    ? body.supplements
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim().slice(0, 40))
        .slice(0, 10)
    : [];
  // Registro de hoy de la card (fase 2). Se acota a valores sanos: el modelo no
  // tiene por qué recibir un 999 g de creatina por un bug del cliente.
  const st = body?.supplementsToday;
  const creatineToday = Math.min(30, Math.max(0, Number(st?.creatine_g) || 0));
  const creatineDays = Math.min(
    7,
    Math.max(0, Math.round(Number(st?.creatine_days_7) || 0))
  );
  const proteinScoops = Math.min(
    20,
    Math.max(0, Math.round(Number(st?.protein_scoops) || 0))
  );
  const country =
    typeof body?.country === "string" && body.country.trim()
      ? body.country.trim().slice(0, 60)
      : null;
  const goal =
    typeof body?.goal === "string" && body.goal.trim()
      ? body.goal.trim().slice(0, 60)
      : null;
  const parts = [SYSTEM];
  if (t && typeof t === "object")
    parts.push(
      `Objetivos diarios del usuario: ${t.calories} kcal, ${t.protein}g proteína, ${t.carbs}g carbos, ${t.fat}g grasas.`
    );
  if (goal)
    parts.push(
      `Objetivo actual del usuario: ${goal}. Tenelo en cuenta al estimar y al sugerir comidas.`
    );
  if (country)
    parts.push(
      `Ubicación del usuario: ${country}. Usá comidas, porciones y costumbres típicas de ahí como referencia cuando venga al caso.`
    );
  if (diet.length)
    parts.push(
      `Restricciones alimentarias del usuario: ${diet.join(
        ", "
      )}. Tenelas en cuenta al estimar y al sugerir comidas.`
    );
  if (supplements.length)
    parts.push(
      `Suplementos habituales del usuario: ${supplements.join(
        ", "
      )}. Son habituales: no asumas que los tomó hoy ni sumes sus calorías salvo que los mencione. No recomiendes empezar a tomarlos ni des dosis médicas; si pregunta, respondé información general y sugerí consultar a un profesional.`
    );
  if (creatineToday || creatineDays || proteinScoops) {
    const bits = [];
    if (creatineToday)
      bits.push(
        `creatina ${creatineToday} g hoy (${creatineDays} de los últimos 7 días)`
      );
    else if (creatineDays)
      bits.push(
        `sin creatina registrada hoy (${creatineDays} de los últimos 7 días)`
      );
    if (proteinScoops)
      bits.push(
        `${proteinScoops} ${
          proteinScoops === 1 ? "scoop" : "scoops"
        } de proteína en polvo (~${
          proteinScoops * 24
        } g de proteína y ~${
          proteinScoops * 120
        } kcal, ya incluidas en las comidas del día)`
      );
    parts.push(
      `Registro de suplementos de hoy: ${bits.join(
        "; "
      )}. La dosis habitual de creatina es 3–5 g/día. Podés comentar la adherencia y el aporte de la proteína, pero no recomiendes empezar suplementos ni des indicaciones médicas.`
    );
  }
  const sys = parts.join("\n");

  let text;
  try {
    text = await complete({ system: sys, messages, image });
  } catch (e) {
    return reply(
      { error: e.message || "Error del modelo." },
      e.status || 502
    );
  }

  // Burbuja visible + tarjetas estructuradas (comida y peso). El parseo vive
  // en lib/chatParse.js: tolera markdown, claves en español y coma decimal.
  const parsed = parseAssistantText(text);
  // Si el modelo no emitió la línea PESO, la tarjeta se arma desde el mensaje
  // del usuario: no dependemos de que el modelo obedezca al pie de la letra.
  const weight =
    parsed.weight ||
    (last.role === "user" ? weightFromUserMessage(last.content) : null);

  const newCount = used + 1;
  usage.set(key, {
    day,
    count: newCount,
  });
  return reply({
    reply: parsed.reply,
    estimate: parsed.estimate,
    weight,
    // Lo que se entendió de la nota de voz (null si el mensaje era de texto).
    transcript,
    used: newCount,
    limit,
    remaining: Math.max(0, limit - newCount),
    isDemo,
    tier,
  });
}
