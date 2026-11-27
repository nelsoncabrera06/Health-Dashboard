-- 016 — Resumen diario de usuarios nuevos por email
--
-- No notificamos en el momento del signup: un cron de Supabase revisa una vez
-- por día y manda UN mail con los usuarios que todavía no se avisaron. Si no
-- hay nuevos, no manda nada. El switch vive en app_settings (key
-- 'admin_notifications') y se maneja desde /admin.
--
-- Requiere pg_cron + pg_net (ya habilitadas en el proyecto) y el secreto/URL
-- en Supabase Vault para el job (ver el final del archivo).
--
-- Ejecutar en Supabase → SQL editor.

-- ── Provider (Google / email) para el mail y el panel ────────────
alter table public.profiles
  add column if not exists provider text;

update public.profiles p
set provider = coalesce(
  nullif(trim(u.raw_app_meta_data ->> 'provider'), ''),
  'email'
)
from auth.users u
where u.id = p.id
  and (p.provider is null or trim(p.provider) = '');

-- El trigger de alta ahora guarda display_name + provider (ver migración 015).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, username, display_name, provider)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(
      nullif(trim(new.raw_app_meta_data ->> 'provider'), ''),
      'email'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── Estado de notificación (solo service_role) ──────────────────
create table if not exists public.admin_notified_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notified_at timestamptz not null default now()
);

comment on table public.admin_notified_users is
  'Usuarios ya incluidos en un resumen de signups. RLS sin policies: solo service_role.';

alter table public.admin_notified_users enable row level security;

-- Los usuarios que ya existían no se avisan: el primer resumen arranca vacío.
insert into public.admin_notified_users (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ── Pendientes para el endpoint ─────────────────────────────────
create or replace function public.pending_signup_notifications(p_limit int default 100)
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  provider text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.email, p.username, p.display_name, p.provider, p.created_at
  from public.profiles p
  left join public.admin_notified_users n on n.user_id = p.id
  where n.user_id is null
  order by p.created_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function public.pending_signup_notifications(int) is
  'Perfiles nuevos que todavía no entraron en un resumen de signups.';

revoke all on function public.pending_signup_notifications(int)
  from public, anon, authenticated;
grant execute on function public.pending_signup_notifications(int)
  to service_role;

-- ── Setup del cron (ejecutar una vez, después de desplegar el endpoint) ──
-- 1) Guardar URL y secreto en Vault (reemplazar los valores):
--    select vault.create_secret(
--      'https://nutritiondashboard.vercel.app/api/cron/signup-digest',
--      'signup_digest_url'
--    );
--    select vault.create_secret(
--      '<SIGNUP_DIGEST_SECRET>',
--      'signup_digest_secret'
--    );
--
-- 2) Programar el job: 13:00 UTC = 10:00 ART (Argentina no tiene DST).
--    select cron.schedule(
--      'signup-digest',
--      '0 13 * * *',
--      $$
--      select net.http_post(
--        url := (select decrypted_secret from vault.decrypted_secrets where name = 'signup_digest_url'),
--        headers := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'signup_digest_secret')
--        ),
--        body := '{}'::jsonb
--      );
--      $$
--    );
