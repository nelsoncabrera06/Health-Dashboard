-- 009 — La cuenta demo no escribe en la base
--
-- La demo es una cuenta pública y compartida: todos los visitantes entran con
-- el mismo user_id. Desde la UI, lo que registra un visitante vive en el
-- sandbox del navegador (lib/demoSandbox.js) y nunca toca Supabase.
--
-- Pero el JWT de la demo queda en el localStorage y cualquiera puede llamar a
-- PostgREST directo (o a /api/v1 con ese Bearer). Esto cierra esa puerta en la
-- base: insert/update/delete de meals, workouts, weights y profiles con un JWT
-- cuyo perfil sea role='demo' → 42501.
--
-- service_role y el SQL editor (auth.uid() es null) siguen pudiendo, así que
-- los seeds (005_demo_seed.sql) y scripts/refresh_demo.py no se ven afectados.
--
-- Ejecutar en Supabase → SQL editor.

begin;

-- Helper: true solo para un JWT real cuyo perfil es la demo.
-- security definer para poder leer profiles aunque la policy cambie.
create or replace function public.is_demo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'demo'
  );
$$;

comment on function public.is_demo() is
  'True si el JWT actual pertenece a la cuenta demo (pública, solo lectura).';

create or replace function public.block_demo_writes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.is_demo() then
    raise exception 'La cuenta demo es de solo lectura. Creá tu cuenta para guardar datos.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

comment on function public.block_demo_writes() is
  'Bloquea escrituras de la cuenta demo. El sandbox de la demo vive en el navegador.';

-- Datos de dominio: ni insert, ni update, ni delete.
drop trigger if exists block_demo_writes on public.meals;
create trigger block_demo_writes
  before insert or update or delete on public.meals
  for each statement execute function public.block_demo_writes();

drop trigger if exists block_demo_writes on public.workouts;
create trigger block_demo_writes
  before insert or update or delete on public.workouts
  for each statement execute function public.block_demo_writes();

drop trigger if exists block_demo_writes on public.weights;
create trigger block_demo_writes
  before insert or update or delete on public.weights
  for each statement execute function public.block_demo_writes();

-- Perfil: la demo no se edita desde la app (los datos son de ejemplo). El
-- trigger protect_profile_privileges (008) ya cubre role/tier/status; este
-- cubre el resto de las columnas.
drop trigger if exists block_demo_writes on public.profiles;
create trigger block_demo_writes
  before update or delete on public.profiles
  for each statement execute function public.block_demo_writes();

commit;

-- ── Verificación ───────────────────────────────────────────────
-- a) triggers creados
select tgname, tgrelid::regclass as tabla, tgenabled
from pg_trigger
where tgname = 'block_demo_writes'
order by tabla;

-- b) helpers
select proname from pg_proc
where proname in ('is_demo', 'block_demo_writes')
order by proname;
