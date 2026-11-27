-- 010 — Objetivo de composición corporal en el onboarding
--
-- El objetivo elegido (pérdida de grasa, recomposición, volumen, mantenimiento
-- o rendimiento) define el ajuste calórico y las macros en lib/profile.js.
-- Antes se deducía comparando el peso actual con la meta, y eso no permitía
-- distinguir recomposición de pérdida de grasa ni rendimiento deportivo.
--
-- Ejecutar en Supabase → SQL editor.

alter table profiles add column if not exists goal_type text;

alter table profiles drop constraint if exists profiles_goal_type_check;
alter table profiles
  add constraint profiles_goal_type_check
  check (
    goal_type is null
    or goal_type in ('fat_loss', 'recomp', 'muscle_gain', 'maintenance', 'endurance')
  );

comment on column profiles.goal_type is
  'Objetivo de composición corporal elegido en el onboarding.';

-- Backfill de perfiles existentes: se infiere con el último peso vs la meta
-- (lo mismo que hace inferGoal() en el cliente). No se recalculan los targets
-- guardados: eso ocurre recién cuando el usuario edita y guarda el perfil.
update profiles p
set goal_type = case
  when p.goal_weight_kg is null or w.weight_kg is null then 'maintenance'
  when p.goal_weight_kg < w.weight_kg - 0.5 then 'fat_loss'
  when p.goal_weight_kg > w.weight_kg + 0.5 then 'muscle_gain'
  else 'maintenance'
end
from (
  select distinct on (user_id) user_id, weight_kg
  from weights
  order by user_id, measured_at desc
) w
where w.user_id = p.id
  and p.goal_type is null;

-- Perfiles que ya hicieron el onboarding pero no tienen pesajes: mantenimiento.
update profiles
set goal_type = 'maintenance'
where goal_type is null and onboarded_at is not null;

-- La demo es el ejemplo público: pérdida de grasa, coherente con su peso y meta.
update profiles
set goal_type = 'fat_loss'
where role = 'demo' and goal_type is null;
