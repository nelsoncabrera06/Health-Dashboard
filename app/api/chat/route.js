import { createClient } from "@supabase/supabase-js";

// Paso 9a: chat de texto con OpenRouter. La API key vive solo en el servidor.
// El cliente manda su access token (Bearer) y acá se valida contra Supabase.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "cohere/north-mini-code:free";
const DAILY_LIMIT = 20;

// Rate limit simple en memoria: userId -> { day, count }.
const usage = new Map();

const SYSTEM = `Sos el asistente de nutrición de Health Dashboard. Hablás español rioplatense, tono tranqui y corto.
Cuando el usuario te cuenta qué comió, estimá calorías y macros (proteína, carbos, grasas en gramos).
Si falta info (porciones, ingredientes), igual estimá con supuestos razonables y avisalo en una línea.
Si el usuario saluda o pregunta algo general, respondé normal sin estimar nada.
IMPORTANTE: siempre que haya una estimación, cerrá tu respuesta con una línea separada con este formato exacto:
ESTIMACIÓN: {"meal": "nombre corto", "calories": N, "protein": N, "carbs": N, "fat": N}
Aclaración: son estimaciones aproximadas, no consejo médico.`;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token)
    return Response.json({ error: "No autenticado." }, { status: 401 });

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user)
    return Response.json({ error: "Sesión inválida." }, { status: 401 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey)
    return Response.json(
      { error: "Falta OPENROUTER_API_KEY en el servidor (.env)." },
      { status: 500 }
    );

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

  const t = body?.targets;
  const sys =
    t && typeof t === "object"
      ? `${SYSTEM}\nObjetivos diarios del usuario: ${t.calories} kcal, ${t.protein}g proteína, ${t.carbs}g carbos, ${t.fat}g grasas.`
      : SYSTEM;

  let r;
  try {
    r = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3100",
        "X-Title": "Health Dashboard",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          ...messages.map((m) => ({
            role: m.role,
            content: m.content.slice(0, 4000),
          })),
        ],
      }),
    });
  } catch {
    return Response.json(
      { error: "No se pudo contactar al modelo." },
      { status: 502 }
    );
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return Response.json(
      { error: `El modelo respondió ${r.status}. ${text.slice(0, 200)}` },
      { status: 502 }
    );
  }
  const out = await r.json();
  const text = out?.choices?.[0]?.message?.content || "";

  let estimate = null;
  let reply = text;
  const mLine = text.match(/ESTIMACIÓN:\s*(\{.*\})/);
  if (mLine) {
    try {
      const e = JSON.parse(mLine[1]);
      if (e && isFinite(+e.calories)) {
        estimate = {
          meal: String(e.meal || "Comida"),
          calories: Math.round(+e.calories),
          protein: Math.round(+e.protein || 0),
          carbs: Math.round(+e.carbs || 0),
          fat: Math.round(+e.fat || 0),
        };
      }
    } catch {
      // Si el JSON viene roto, se devuelve el texto pelado.
    }
    reply = text.replace(mLine[0], "").trim();
  }

  usage.set(user.id, {
    day,
    count: (u && u.day === day ? u.count : 0) + 1,
  });
  return Response.json({ reply, estimate });
}
