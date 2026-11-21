// Rate limit diario por API key. El contador vive en Postgres (api_usage)
// porque en serverless la memoria no se comparte entre requests.
import { serviceClient } from "./service";

// Fail-open: si el contador falla, dejamos pasar. El límite es anti-abuso, no
// autenticación; no queremos tumbar la API por un problema del RPC.
export async function bumpUsage(keyId, limit = 1000) {
  const db = serviceClient();
  if (!db) return { allowed: true, count: 0, limit, error: "no_db" };

  try {
    const { data, error } = await db.rpc("bump_api_usage", {
      p_key: keyId,
      p_limit: limit,
    });
    if (error) throw error;
    const count = Number(data) || 0;
    return { allowed: count <= limit, count, limit };
  } catch (e) {
    return { allowed: true, count: 0, limit, error: e?.message || "rpc_error" };
  }
}
