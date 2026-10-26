-- 003_onboarding.sql
-- Onboarding: datos esenciales del perfil + preferencias alimentarias.
-- Ejecutar en Supabase (SQL editor o `supabase db push`).

alter table profiles
  add column if not exists sex text check (sex in ('male', 'female', 'other')),
  add column if not exists age int check (age between 14 and 100),
  -- Ej: {vegetariano,sin_lactosa}. Los valores válidos viven en lib/profile.js.
  add column if not exists diet_tags text[] not null default '{}',
  -- null = todavía no hizo el onboarding (el dashboard le muestra el wizard).
  add column if not exists onboarded_at timestamptz;

-- Perfiles ya cargados (Nelson, demo): no tienen que ver el wizard otra vez.
-- Igual pueden abrirlo desde "✏️ Editar" en la tarjeta de perfil.
update profiles
set onboarded_at = now()
where onboarded_at is null
  and height_cm is not null
  and goal_weight_kg is not null;
