// GET  /api/suggestions  → últimos mensajes propios (para mostrarlos en la página)
// POST /api/suggestions  → envía una sugerencia de texto libre
//
// Solo sesión de la web (requireWebSession): una API key no escribe feedback y
// la demo ya queda bloqueada en authenticate().
//
// La tabla `suggestions` tiene RLS sin policies: todo pasa por acá con
// service_role y el user_id se filtra a mano.
import { requireWebSession } from "../../../lib/api/keyManager";
import { apiError } from "../../../lib/api/log";
import { serviceClient } from "../../../lib/api/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN = 10;
const MAX = 2000;
const DAILY_LIMIT = 10;
const NO_STORE = { "Cache-Control": "no-store" };

// Cupo en memoria (mismo criterio que el chat): alcanza para frenar el spam de
// un usuario. En serverless se puede exceder al cambiar de instancia.
const usage = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function takeSlot(userId) {
  const day = todayKey();
  const current = usage.get(userId);
  if (!current || current.day !== day) {
    usage.set(userId, { day, count: 1 });
    return true;
  }
  if (current.count >= DAILY_LIMIT) return false;
  current.count += 1;
  return true;
}

export async function GET(req) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  const { data, error } = await db
    .from("suggestions")
    .select("id, message, status, created_at")
    .eq("user_id", session.auth.userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error)
    return apiError(500, "server_error", "No se pudieron leer tus sugerencias.");

  return Response.json({ suggestions: data || [] }, { headers: NO_STORE });
}

export async function POST(req) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  let body;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body", "El cuerpo no es JSON válido.");
  }

  const message =
    typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < MIN)
    return apiError(
      400,
      "invalid_message",
      `Escribí al menos ${MIN} caracteres.`
    );
  if (message.length > MAX)
    return apiError(
      400,
      "invalid_message",
      `El mensaje no puede superar los ${MAX} caracteres.`
    );

  if (!takeSlot(session.auth.userId))
    return apiError(
      429,
      "rate_limited",
      "Ya enviaste varias sugerencias hoy. Probá de nuevo mañana.",
      { limit: DAILY_LIMIT }
    );

  const db = serviceClient();
  if (!db)
    return apiError(
      500,
      "server_misconfigured",
      "Falta configurar Supabase en el servidor."
    );

  // Copia del email: si la cuenta se borra, la sugerencia queda igual.
  const { data: userData } = await db.auth.admin.getUserById(
    session.auth.userId
  );
  const email = userData?.user?.email || null;

  const { data, error } = await db
    .from("suggestions")
    .insert({
      user_id: session.auth.userId,
      email,
      message,
    })
    .select("id, message, status, created_at")
    .single();

  if (error)
    return apiError(500, "server_error", "No se pudo guardar tu sugerencia.");

  return Response.json({ suggestion: data }, { status: 201, headers: NO_STORE });
}
