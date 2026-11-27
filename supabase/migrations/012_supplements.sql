-- 012 — Suplementos en el perfil
--
-- Solo contexto para el chat: qué suplementos dice tomar el usuario. No se
-- suman macros acá ni se recomiendan; el registro diario (creatina/proteína)
-- va en la fase 2 del plan (tabla creatine_logs + meals.source).
--
-- Ejecutar en Supabase → SQL editor.

-- Chips curados en la app: 'creatine' y 'protein_powder'.
alter table profiles
  add column if not exists supplements text[] not null default '{}';

-- Texto libre para lo que no está en el catálogo (chía, ashwagandha, etc.).
alter table profiles
  add column if not exists supplements_other text;

alter table profiles
  drop constraint if exists profiles_supplements_other_check;
alter table profiles
  add constraint profiles_supplements_other_check
  check (supplements_other is null or char_length(supplements_other) <= 120);

comment on column profiles.supplements is
  'Suplementos habituales elegidos del catálogo (creatine, protein_powder).';
comment on column profiles.supplements_other is
  'Suplementos fuera del catálogo, texto libre. Solo contexto para el chat.';
