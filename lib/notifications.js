// Resumen diario de usuarios nuevos por email (Resend).
//
// Flujo: pg_cron de Supabase → /api/cron/signup-digest → esta función:
//   1. lee el switch de app_settings (key 'admin_notifications');
//   2. busca perfiles que no están en admin_notified_users;
//   3. si no hay, no manda nada;
//   4. si hay, manda UN mail con la lista y los marca.
//
// Si el mail falla, no se marcan: la próxima corrida los vuelve a incluir.
import { serviceClient } from "./api/service";

export const NOTIFICATIONS_KEY = "admin_notifications";
export const MAX_EMAIL_USERS = 50;
export const SCHEDULE_LABEL = "Todos los días a las 10:00 (ART)";

function appUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (raw) return raw.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://nutritiondashboard.vercel.app";
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO);
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

export async function getNotificationsConfig() {
  const db = serviceClient();
  if (!db)
    return {
      enabled: true,
      updatedAt: null,
      emailConfigured: emailConfigured(),
      configured: false,
    };

  const { data } = await db
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", NOTIFICATIONS_KEY)
    .maybeSingle();

  return {
    enabled: data?.value?.enabled !== false,
    updatedAt: data?.updated_at || null,
    emailConfigured: emailConfigured(),
    configured: true,
  };
}

export async function setNotificationsEnabled(enabled, userId) {
  if (typeof enabled !== "boolean")
    return fail(400, "invalid_body", "`enabled` tiene que ser true o false.");

  const db = serviceClient();
  if (!db) return fail(500, "server_misconfigured", "Falta configurar Supabase.");

  const { error } = await db.from("app_settings").upsert(
    {
      key: NOTIFICATIONS_KEY,
      value: { enabled },
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" }
  );

  if (error)
    return fail(500, "server_error", "No se pudo guardar la preferencia.");
  return { ok: true, enabled };
}

async function pendingUsers(limit = 500) {
  const db = serviceClient();
  if (!db) return { error: "server_misconfigured" };
  const { data, error } = await db.rpc("pending_signup_notifications", {
    p_limit: limit,
  });
  if (error) return { error: "server_error" };
  return { users: data || [] };
}

export async function getNotificationsStatus() {
  const db = serviceClient();
  const config = await getNotificationsConfig();
  if (!db)
    return {
      ...config,
      pending: 0,
      lastNotifiedAt: null,
      schedule: SCHEDULE_LABEL,
      configured: false,
    };

  const [pending, last] = await Promise.all([
    pendingUsers(500),
    db
      .from("admin_notified_users")
      .select("notified_at")
      .order("notified_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    ...config,
    pending: pending.users ? pending.users.length : 0,
    lastNotifiedAt: last.data?.notified_at || null,
    schedule: SCHEDULE_LABEL,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function providerLabel(provider) {
  if (!provider) return "—";
  if (provider === "email") return "Email";
  if (provider === "google") return "Google";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      timeZone: "America/Buenos_Aires",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso || "");
  }
}

export function renderSignupDigest(users, total = users.length) {
  const list = users.slice(0, MAX_EMAIL_USERS);
  const count = Number(total) || list.length;
  const plural = count === 1 ? "usuario nuevo" : "usuarios nuevos";
  const subject = `${count} ${plural} en Nutrition Dashboard`;

  const rows = list
    .map((u) => {
      const name = escapeHtml(u.display_name || u.username || "Sin nombre");
      const username = u.username ? ` (@${escapeHtml(u.username)})` : "";
      const email = escapeHtml(u.email || "sin email");
      const provider = escapeHtml(providerLabel(u.provider));
      const date = escapeHtml(fmtDate(u.created_at));
      return `<li style="margin:0 0 10px">
        <strong>${name}</strong>${username}<br>
        <span style="color:#475569">${email} · ${provider} · ${date}</span>
      </li>`;
    })
    .join("");

  const extra =
    count > list.length
      ? `<p style="margin:12px 0 0;color:#475569">… y ${count - list.length} más. Entrá al panel para verlos todos.</p>`
      : "";

  const admin = `${appUrl()}/admin`;
  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">
      <h1 style="margin:0 0 6px;font-size:20px">Usuarios nuevos</h1>
      <p style="margin:0 0 18px;color:#475569;font-size:14px">
        ${count} ${plural} desde el último resumen.
      </p>
      <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">
        ${rows}
      </ul>
      ${extra}
      <p style="margin:22px 0 0">
        <a href="${escapeHtml(admin)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-size:14px;font-weight:600">
          Ver en el panel
        </a>
      </p>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:11px">
        Resumen diario. Podés apagarlo en Admin → Notificaciones.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `${count} ${plural} en Nutrition Dashboard`,
    "",
    ...list.map(
      (u) =>
        `- ${u.display_name || u.username || "Sin nombre"}${
          u.username ? ` (@${u.username})` : ""
        } · ${u.email || "sin email"} · ${providerLabel(u.provider)} · ${fmtDate(
          u.created_at
        )}`
    ),
    ...(count > list.length ? [`… y ${count - list.length} más.`] : []),
    "",
    `Panel: ${admin}`,
    "Resumen diario. Podés apagarlo en Admin → Notificaciones.",
  ].join("\n");

  return { subject, html, text };
}

async function sendEmail({ subject, html, text }) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.NOTIFY_EMAIL_FROM ||
          "Nutrition Dashboard <onboarding@resend.dev>",
        to: [process.env.NOTIFY_EMAIL_TO],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
      return {
        ok: false,
        message: body?.message || `Resend respondió ${res.status}.`,
      };
    return { ok: true, id: body?.id || null };
  } catch (e) {
    return { ok: false, message: e?.message || "No se pudo enviar el email." };
  }
}

export async function sendSignupDigest({ manual = false } = {}) {
  const config = await getNotificationsConfig();
  if (!config.enabled && !manual)
    return { ok: true, sent: false, skipped: "disabled", pending: 0 };

  if (!config.emailConfigured)
    return fail(
      503,
      "email_not_configured",
      "Falta RESEND_API_KEY o NOTIFY_EMAIL_TO en el servidor."
    );

  const pending = await pendingUsers(500);
  if (pending.error)
    return fail(
      500,
      pending.error,
      "No se pudieron leer los usuarios pendientes."
    );

  const users = pending.users || [];
  if (!users.length) return { ok: true, sent: false, pending: 0 };

  const { subject, html, text } = renderSignupDigest(users, users.length);
  const sent = await sendEmail({ subject, html, text });
  if (!sent.ok) return fail(502, "email_failed", sent.message);

  const db = serviceClient();
  const { error } = await db.from("admin_notified_users").upsert(
    users.map((u) => ({ user_id: u.id })),
    { onConflict: "user_id" }
  );

  if (error)
    return fail(
      500,
      "mark_failed",
      "El email se envió, pero no se pudieron marcar los usuarios. Se reintentará."
    );

  return {
    ok: true,
    sent: true,
    pending: users.length,
    count: users.length,
    shown: Math.min(users.length, MAX_EMAIL_USERS),
  };
}
