-- 008 — Roles user/admin/demo, candado anti-escalación y config global de AI
--
-- 1. `profiles.role` suma `demo`. La demo es una cuenta pública y compartida:
--    mismo producto que un `user`, con dos excepciones explícitas (límite de
--    10 mensajes/día en el chat y sin API keys). Tenerlo como rol evita seguir
--    comparando emails contra `NEXT_PUBLIC_DEMO_EMAIL` en cada chequeo.
--
-- 2. Candado de privilegios. La policy "profiles own update" (001) permite
--    editar la fila propia y `role`/`tier`/`status` son columnas de esa fila:
--    sin esto, cualquier usuario logueado puede hacer
--        PATCH /rest/v1/profiles?id=eq.<su id>  {"role":"admin"}
--    y `is_admin()` le abre la salud de todos. El whitelist de la app
--    (`setUserPrefs`) no alcanza porque PostgREST va directo a la tabla.
--    OJO: `revoke update (role)` por columna NO sirve si existe el grant de
--    tabla (PostgreSQL no resta privilegios de columna de un UPDATE de tabla).
--    Por eso el candado va por trigger.
--
-- 3. `app_settings`: configuración global editable desde /admin. Hoy guarda el
--    provider/modelo de AI; mañana lo que haga falta. Es lectura de servidor,
--    no de navegador: RLS queda activo y SIN policies (solo service_role).
--
-- 4. Admin deja de leer la salud ajena: se saca `or is_admin()` de las policies
--    de dominio. Admin gestiona usuarios y settings por rutas de servidor, no
--    husmeando comidas. `profiles` mantiene su policy de admin.

begin;

-- ── 1. Roles: sumar 'demo' ─────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'demo'));

-- ── 2. Candado: role/tier/status solo sin JWT de usuario ───────
-- `auth.uid()` es null para service_role y para el SQL editor, que siguen
-- pudiendo asignar roles. Cualquier JWT real (user/admin/demo) queda bloqueado.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and (
       new.role   is distinct from old.role
       or new.tier   is distinct from old.tier
       or new.status is distinct from old.status
     ) then
    raise exception 'No podés modificar role, tier ni status desde la app.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.protect_profile_privileges() is
  'Rechaza cambios de role/tier/status hechos con un JWT de usuario. Los roles se asignan por SQL o con service_role.';

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ── 3. app_settings ────────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.app_settings is
  'Configuración global (ej. key = ''ai''). Editable desde /admin. Solo service_role: RLS sin policies.';

alter table public.app_settings enable row level security;

drop policy if exists "app_settings service only" on public.app_settings;

-- ── 4. Admin no lee la salud ajena ─────────────────────────────
drop policy if exists "own rows" on public.meals;
create policy "own rows" on public.meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.workouts;
create policy "own rows" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on public.weights;
create policy "own rows" on public.weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "api_keys own select" on public.api_keys;
create policy "api_keys own select" on public.api_keys
  for select using (auth.uid() = user_id);

commit;

-- ── Verificación ───────────────────────────────────────────────
-- a) check de roles
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c';

-- b) trigger del candado
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- c) policies de dominio: ninguna debe mencionar is_admin()
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('meals', 'workouts', 'weights', 'api_keys', 'app_settings')
order by tablename, policyname;

-- d) app_settings con RLS y sin policies
select relname, relrowsecurity
from pg_class where oid = 'public.app_settings'::regclass;

select count(*) as policies_app_settings
from pg_policies
where schemaname = 'public' and tablename = 'app_settings';
