-- 013 — Seguimiento diario de suplementos
--
-- Fase 2 del plan de suplementos (ver agent-plan/plan-supplements.md):
--   - Creatina: no aporta calorías, va a su propia tabla (una fila por día).
--   - Proteína en polvo: es comida, va a `meals` con source='supplement' para
--     que cuente en los totales, el gráfico y la API sin duplicar lógica.
--
-- Ejecutar en Supabase → SQL editor.

create table if not exists creatine_logs (
  user_id uuid not null references profiles(id) on delete cascade,
  taken_on date not null,
  grams numeric(5,1) not null check (grams > 0 and grams <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, taken_on)
);

comment on table creatine_logs is
  'Creatina registrada por día (0 kcal). Un registro por usuario y fecha.';

alter table creatine_logs enable row level security;

drop policy if exists "own rows" on creatine_logs;
create policy "own rows" on creatine_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- La demo es pública y de solo lectura (mismo criterio que 009).
drop trigger if exists block_demo_writes on creatine_logs;
create trigger block_demo_writes
  before insert or update or delete on creatine_logs
  for each statement execute function public.block_demo_writes();

-- Origen de la comida: manual (formulario), chat, api/mcp o supplement (card).
alter table meals
  add column if not exists source text not null default 'manual';

alter table meals
  drop constraint if exists meals_source_check;
alter table meals
  add constraint meals_source_check
  check (source in ('manual', 'chat', 'api', 'supplement'));

comment on column meals.source is
  'Origen de la fila: manual, chat, api o supplement (proteína en polvo de la card).';

-- Verificación rápida (descomentar en el SQL editor si hace falta):
-- select source, count(*) from meals group by source;
-- select * from creatine_logs limit 5;
