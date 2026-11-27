-- 011 — Sugerencias / feedback de los usuarios
--
-- Un formulario libre en /suggestions (menú del usuario) para que cada persona
-- le cuente al dueño qué mejorar. La escribe la API con service_role; el
-- navegador nunca toca la tabla.
--
-- RLS activo SIN policies a propósito: solo service_role (la API valida la
-- sesión y filtra user_id). Así nadie puede leer las sugerencias de otro.
--
-- `user_id` con ON DELETE SET NULL + copia del email: si la cuenta se borra,
-- el feedback no desaparece (no queremos perder mejoras por una baja).
--
-- Ejecutar en Supabase → SQL editor.

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  email text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint suggestions_message_check
    check (char_length(message) between 10 and 2000),
  constraint suggestions_status_check check (status in ('new', 'read'))
);

comment on table suggestions is
  'Feedback libre de los usuarios (formulario /suggestions).';

create index if not exists suggestions_created_at_idx
  on suggestions (created_at desc);

create index if not exists suggestions_user_idx
  on suggestions (user_id, created_at desc);

alter table suggestions enable row level security;
