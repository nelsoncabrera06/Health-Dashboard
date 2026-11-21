// PATCH  /api/keys/[id] → revoca la key y la deja en la lista como registro.
// DELETE /api/keys/[id] → la borra de verdad, junto con su contador de uso.
//
// Revocar es definitivo: no hay forma de reactivar. Si la key se filtró o ya no
// la usás, se revoca (queda la constancia) o se elimina (no queda nada). Para
// volver a usar el agente se crea una key nueva.
//
// Solo sesión de la web (JWT) y solo la key propia: una key de API no puede
// gestionar keys, así que una filtrada no sirve para crear ni borrar nada.
import {
  deleteKey,
  requireWebSession,
  revokeKey,
} from "../../../../lib/api/keyManager";
import { apiError } from "../../../../lib/api/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function PATCH(req, { params }) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  const { id } = await params;
  const res = await revokeKey(session.auth.userId, id);

  if (!res.ok) return apiError(res.status, res.code, res.message);

  return Response.json({ key: res.key }, { headers: NO_STORE });
}

export async function DELETE(req, { params }) {
  const session = await requireWebSession(req);
  if (!session.ok)
    return apiError(session.status, session.code, session.message);

  const { id } = await params;
  const res = await deleteKey(session.auth.userId, id);

  if (!res.ok) return apiError(res.status, res.code, res.message);

  return Response.json({ key: res.key }, { headers: NO_STORE });
}
