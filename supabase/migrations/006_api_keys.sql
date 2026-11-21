-- 006_api_keys.sql
-- API keys por usuario para agentes (REST /api/v1 + MCP /api/mcp).
-- Ejecutar en Supabase (SQL editor o psql).
--
-- Piezas:
--   api_keys        metadata de la key (visible por el dueño). NUNCA guarda el token.
--   api_key_secrets solo el hash SHA-256, sin policies: únicamente service_role.
--   api_usage       contador diario por key (rate limit serverless-safe).
--   api_requests    audit log de cada request de API (sin bodies: son datos de salud).
--   meals.client_ref  idempotencia para que un agente que reintenta no duplique comidas.
--   profiles.timezone cortes de día de la API (hoy el "hoy" se calcula en el navegador).
--
-- OJO: service_role bypassa RLS. La app tiene que filtrar user_id a mano en cada query.

-- ── 1. Zona horaria del perfil ─────────────────────────────────
-- Default Argentina (la app es de acá); el onboarding la autodetecta.
alter table profiles
  add column if not exists timezone text not null default 'America/Buenos_Aires';

-- ── 2. Idempotencia de comidas ─────────────────────────────────
-- `meals` no tiene unique sobre la fecha; el agente manda client_ref y, si
-- reintenta con el mismo valor, recibe la fila existente en vez de duplicarla.
alter table meals add column if not exists client_ref text;
create unique index if not exists meals_user_client_ref_idx
  on meals (user_id, client_ref)
  where client_ref is not null;

-- ── 3. api_keys (metadata, sin secretos) ───────────────────────
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Primeros chars de la key, para mostrarla en la UI ("hd_live_a1b2…").
  prefix text not null,
  scopes text[] not null default '{health:read}'
    check (cardinality(scopes) >= 1)
    check (scopes <@ array['health:read', 'meals:write', 'weights:write', 'workouts:write']::text[]),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  -- Vencimiento elegible (90 días / 6 meses / 1 año), máximo 1 año.
  constraint api_keys_expiry_check check (expires_at > created_at),
  constraint api_keys_expiry_max check (expires_at <= created_at + interval '366 days')
);
create index if not exists api_keys_user_idx on api_keys (user_id, created_at desc);

alter table api_keys enable row level security;

-- Solo lectura para el dueño. La escritura (crear/revocar) pasa por las rutas
-- server-side con service_role, que valida tier y scopes.
drop policy if exists "api_keys own select" on api_keys;
create policy "api_keys own select" on api_keys
  for select using (auth.uid() = user_id or public.is_admin());

-- ── 4. api_key_secrets (solo hash) ─────────────────────────────
create table if not exists api_key_secrets (
  key_id uuid primary key references api_keys (id) on delete cascade,
  hash text not null unique,
  created_at timestamptz not null default now()
);

alter table api_key_secrets enable row level security;
-- A propósito: SIN policies. Con RLS activo y cero policies, anon/authenticated
-- no ven nada; service_role (bypassa RLS) es el único que lee y escribe.
-- Si alguien agrega una policy de select, el hash queda visible desde el navegador.

-- ── 5. Rate limit por key (en Postgres, no en memoria) ─────────
create table if not exists api_usage (
  key_id uuid not null references api_keys (id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (key_id, day)
);

alter table api_usage enable row level security;  -- sin policies: solo service_role

create or replace function public.bump_api_usage(p_key uuid, p_limit int default 1000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
begin
  insert into api_usage (key_id, day, count)
  values (p_key, current_date, 1)
  on conflict (key_id, day) do update set count = api_usage.count + 1
  returning count into c;
  return c;
end;
$$;

-- Sin esto, cualquier cliente con la anon key podría inflar contadores ajenos.
revoke all on function public.bump_api_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_api_usage(uuid, int) to service_role;

-- ── 6. Audit log ───────────────────────────────────────────────
create table if not exists api_requests (
  id bigserial primary key,
  key_id uuid references api_keys (id) on delete set null,
  user_id uuid references auth.users (id) on delete cascade,
  tool text,        -- nombre de la tool MCP o "GET /api/v1/meals"
  method text,
  path text,
  status int,
  ms int,
  created_at timestamptz not null default now()
);
create index if not exists api_requests_user_created_idx
  on api_requests (user_id, created_at desc);

alter table api_requests enable row level security;

-- El dueño puede ver su actividad; el insert lo hace service_role (sin policy).
drop policy if exists "api_requests own select" on api_requests;
create policy "api_requests own select" on api_requests
  for select using (auth.uid() = user_id or public.is_admin());

-- ── Verificación ───────────────────────────────────────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('api_keys', 'api_key_secrets', 'api_usage', 'api_requests')
order by 1;

select tablename, policyname, cmd
from pg_policies
where tablename in ('api_keys', 'api_key_secrets', 'api_usage', 'api_requests')
order by 1, 2;
