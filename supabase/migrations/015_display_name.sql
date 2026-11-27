-- 015 — `display_name` con default al registrarse
--
-- Hasta ahora el trigger solo guardaba username; `display_name` quedaba NULL
-- para todos los registros por email (Google no lo pisaba). La UI caía al
-- username, pero en la DB quedaba vacío y el usuario no tenía dónde cargarlo.
--
-- Ahora: nombre del formulario > nombre de Google (`full_name`/`name`) >
-- username > parte local del email. Y se backfillean los perfiles viejos.
--
-- Ejecutar en Supabase → SQL editor.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, username, display_name)
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
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill: primero el nombre que haya dejado Google/OAuth, después username.
update public.profiles p
set display_name = coalesce(
  nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
  nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
  nullif(trim(p.username), ''),
  split_part(p.email, '@', 1)
)
from auth.users u
where u.id = p.id
  and (p.display_name is null or trim(p.display_name) = '');

-- Perfiles sin fila en auth.users (no debería pasar): username o email.
update public.profiles
set display_name = coalesce(
  nullif(trim(username), ''),
  split_part(email, '@', 1)
)
where display_name is null or trim(display_name) = '';

comment on column public.profiles.display_name is
  'Nombre visible. Default: formulario, nombre de Google, username o email.';
