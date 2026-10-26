import { createClient } from "@supabase/supabase-js";
import { complete } from "../../../lib/ai";

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

const DAILY_LIMIT = 20;

// Rate limit simple en memoria: userId -> { day, count }.
const usage = new Map();

const SYSTEM = `Sos el asistente de nutrición de Health Dashboard. Hablás español rioplatense, tono tranqui y corto.
Cuando el usuario te cuenta qué comió, estimá calorías y macros (proteína, carbos, grasas en gramos).
Si falta info (porciones, ingredientes), igual estimá con supuestos razonables y avisalo en una línea.
Si el usuario saluda o pregunta algo general, respondé normal sin estimar nada.
Si te pregunta si podés registrar, anotar o guardar la comida: la app tiene un botón "Registrar" justo debajo de tu estimación, así que NO digas que no podés. Contestá que con ese botón queda guardado en el día. Nunca menciones herramientas, funciones ni bases de datos.
Si el usuario adjunta una foto de su comida, describí en una línea qué ves en el plato y estimá desde la imagen. La foto siempre llega bien al modelo: nunca digas que no ves ninguna foto.
IMPORTANTE: siempre que haya una estimación, cerrá tu respuesta con una línea separada con este formato exacto:
ESTIMACIÓN: {"meal": "nombre corto", "calories": N, "protein": N, "carbs": N, "fat": N}
Si el usuario mencionó cualquier comida o bebida, esa línea es obligatoria. Escribí todo en texto plano, sin markdown: nada de asteriscos, negritas, guiones bajos ni backticks.
Aclaración: son estimaciones aproximadas, no consejo médico.`;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token)
    return Response.json({ error: "No autenticado." }, { status: 401 });

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json(
      { error: "Falta configurar Supabase en el servidor." },
      { status: 500 }
    );
  }
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user)
    return Response.json({ error: "Sesión inválida." }, { status: 401 });

  const day = todayKey();
  const u = usage.get(user.id);
  if (u && u.day === day && u.count >= DAILY_LIMIT)
    return Response.json(
      { error: "Límite diario del chat alcanzado. Probá mañana." },
      { status: 429 }
    );

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
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
    return Response.json({ error: "Sin mensajes." }, { status: 400 });

  // Visión (paso 11): la foto llega como data URL (el cliente la comprime).
  // El historial se manda solo texto; la imagen va aparte al provider.
  const image =
    typeof body?.image === "string" && body.image.startsWith("data:image/")
      ? body.image
      : null;
  if (typeof body?.image === "string" && !image)
    return Response.json({ error: "La foto llegó en un formato inválido." }, { status: 400 });
  const last = messages[messages.length - 1];
  if (image && last.role === "user" && !last.content.trim())
    last.content = "Describí qué ves en la foto y estimá calorías y macros.";

  const t = body?.targets;
  // Preferencias alimentarias del onboarding (llegan como labels ya legibles).
  const diet = Array.isArray(body?.diet)
    ? body.diet
        .filter((d) => typeof d === "string" && d.trim())
        .map((d) => d.trim().slice(0, 40))
        .slice(0, 10)
    : [];
  const country =
    typeof body?.country === "string" && body.country.trim()
      ? body.country.trim().slice(0, 60)
      : null;
  const parts = [SYSTEM];
  if (t && typeof t === "object")
    parts.push(
      `Objetivos diarios del usuario: ${t.calories} kcal, ${t.protein}g proteína, ${t.carbs}g carbos, ${t.fat}g grasas.`
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
  const sys = parts.join("\n");

  let text;
  try {
    text = await complete({ system: sys, messages, image });
  } catch (e) {
    return Response.json(
      { error: e.message || "Error del modelo." },
      { status: e.status || 502 }
    );
  }

  let estimate = null;
  let reply = text;
  // Texto plano en la burbuja: el modelo igual mete *cursivas* o **negritas**.
  const stripMd = (s) =>
    s
      .replace(/\*\*/g, "")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
      .replace(/`/g, "")
      .replace(/\n{3,}/g, "\n\n");
  // El modelo a veces envuelve la línea en markdown (`**ESTIMACIÓN:** {...}`)
  // y a veces usa claves en español (comida/calorias/...). Se tolera todo eso.
  const norm = text.replace(/[*`]/g, "");
  const mLine =
    norm.match(/ESTIMACI[ÓO]N:?\s*(\{[^{}]*\})/i) ||
    norm.match(/(\{[^{}]*"(calories|calorias|kcal)"[^{}]*\})/i);
  if (mLine) {
    const num = (o, ...keys) => {
      for (const k of keys) if (isFinite(+o[k])) return Math.round(+o[k]);
      return 0;
    };
    try {
      const e = JSON.parse(mLine[1]);
      if (e && isFinite(+e.calories ?? +e.calorias ?? +e.kcal)) {
        estimate = {
          meal: String(e.meal || e.comida || e.nombre || "Comida"),
          calories: num(e, "calories", "calorias", "kcal"),
          protein: num(e, "protein", "proteinas", "proteina"),
          carbs: num(e, "carbs", "carbos", "carbohidratos", "hidratos"),
          fat: num(e, "fat", "grasas", "grasa"),
        };
      }
    } catch {
      // Si el JSON viene roto, se devuelve el texto pelado.
    }
    // La línea de estimación nunca se le muestra al usuario (matchee o no).
    reply = stripMd(text.replace(/^.*ESTIMACI[ÓO]N:?\s*\{[^}]*\}\s*$/im, "").replace(mLine[1], ""))
      .replace(/[-\s:]+$/, "")
      .trim();
  }
  reply = stripMd(reply).trim();

  usage.set(user.id, {
    day,
    count: (u && u.day === day ? u.count : 0) + 1,
  });
  return Response.json({ reply, estimate });
}
