// GET /api/v1/ping — prueba de conexión para agentes.
// Sirve para que el usuario (o la página /developers) verifique que su key
// funciona antes de conectar el agente. No expone datos de salud.
import { withApi } from "../../../../lib/api/log";
import { serviceClient } from "../../../../lib/api/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "ping" }, async (auth) => {
    const db = serviceClient();
    const { data: profile } = db
      ? await db
          .from("profiles")
          .select("username, display_name, tier")
          .eq("id", auth.userId)
          .maybeSingle()
      : { data: null };

    return Response.json(
      {
        ok: true,
        user: {
          id: auth.userId,
          username: profile?.username || null,
          display_name: profile?.display_name || null,
          tier: auth.tier,
        },
        auth: {
          kind: auth.kind,
          scopes: auth.scopes,
          key: auth.keyId
            ? { prefix: auth.keyPrefix, expires_at: auth.expiresAt }
            : null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  });
}
