// POST /api/cron/signup-digest
//
// Lo llama pg_cron de Supabase (una vez por día, 10:00 ART) con el header
// `x-cron-secret`. Manda UN mail con los usuarios nuevos que todavía no se
// avisaron. Si el switch de /admin está apagado, no manda nada.
import { timingSafeEqual } from "crypto";
import { sendSignupDigest } from "../../../../lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(req) {
  const expected = process.env.SIGNUP_DIGEST_SECRET;
  if (!expected)
    return Response.json(
      {
        error: "Falta SIGNUP_DIGEST_SECRET en el servidor.",
        code: "server_misconfigured",
      },
      { status: 500, headers: NO_STORE }
    );

  const got = req.headers.get("x-cron-secret") || "";
  if (!got || !safeEqual(got, expected))
    return Response.json(
      { error: "Secreto del cron inválido.", code: "unauthorized" },
      { status: 401, headers: NO_STORE }
    );

  const result = await sendSignupDigest({ manual: false });
  if (!result.ok)
    return Response.json(
      { error: result.message, code: result.code },
      { status: result.status || 500, headers: NO_STORE }
    );

  return Response.json(result, { headers: NO_STORE });
}
