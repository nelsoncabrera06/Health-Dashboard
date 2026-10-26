-- 004_onboarding_sex_country.sql
-- Ajustes al onboarding: sexo binario (hombre/mujer) + país de referencia.
-- Ejecutar en Supabase (SQL editor o `supabase db push`).

-- Por si quedó algún perfil con la opción anterior "Prefiero no decir".
update profiles
set sex = null
where sex is not null and sex not in ('male', 'female');

alter table profiles drop constraint if exists profiles_sex_check;
alter table profiles
  add constraint profiles_sex_check check (sex in ('male', 'female'));

-- ISO 3166-1 alpha-2 (ej. 'AR'). Opcional: null = sin cargar.
alter table profiles add column if not exists country text;
