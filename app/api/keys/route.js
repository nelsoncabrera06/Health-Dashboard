// GET  /api/keys  → lista las API keys del usuario (sin tokens ni hashes)
// POST /api/keys  → crea una key y devuelve el token UNA sola vez
//
// Solo sesión de la web (JWT). Una API key no puede crear ni revocar keys.
// La UI vive en /connections.
import { createKey, listKeys, requireWebSession, mcpUrl } from "../../../lib/api/keyManager";
import { apiError } from "../../../lib/api/log";
import { limitsFor } from "../../../lib/api/tiers";
import { serviceClient } from "../../../lib/api/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  // El email hace falta para bloquear la cuenta demo (es pública).
  const { data: userData } = await serviceClient().auth.admin.getUserById(
    session.auth.userId
  );
  const email = userData?.user?.email;

  const res = await listKeys(session.auth.userId, email);
  if (!res.ok) return apiError(res.status, res.code, res.message);

  const db = serviceClient();
  const { data: profile } = db
    ? await db
        .from("profiles")
        .select("tier")
        .eq("id", session.auth.userId)
        .maybeSingle()
    : { data: null };

  return Response.json(
    {
      keys: res.keys,
      limits: limitsFor(profile?.tier),
      mcp_url: mcpUrl(req),
    },
    { headers: NO_STORE }
  );
}

export async function POST(req) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  // El email hace falta para bloquear la cuenta demo (es pública).
  const { data: userData } = await serviceClient().auth.admin.getUserById(
    session.auth.userId
  );

  let body;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido.");
  }

  const res = await createKey(session.auth.userId, userData?.user?.email, body);

  if (!res.ok) return apiError(res.status, res.code, res.message);

  // `token` es el único momento en que la key es visible. No se loguea nunca.
  return Response.json(
    { key: res.key, token: res.token },
    { status: 201, headers: NO_STORE }
  );
}
