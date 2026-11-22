// GET /api/v1/me — perfil, targets y zona horaria del dueño de la key.
// Scope: health:read.
import { dateInTz, getProfileData } from "../../../../lib/api/data";
import { apiJson, withApi } from "../../../../lib/api/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return withApi(req, { tool: "get_profile", scope: "health:read" }, async (auth) => {
    const profile = await getProfileData(auth.userId);
    return apiJson(profile, {
      timezone: profile.timezone,
      date: dateInTz(profile.timezone),
    });
  });
}
