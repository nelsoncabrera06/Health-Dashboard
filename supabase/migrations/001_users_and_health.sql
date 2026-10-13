-- 001_users_and_health.sql
-- Patrón de usuarios de fixture-mundial-2026 + tiers, adaptado a Health Dashboard.
-- Ejecutar en Supabase (SQL editor o `supabase db push`).

-- ── profiles: 1 fila por auth.users.id ──────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text unique,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  status text not null default 'active' check (status in ('active', 'trial', 'canceled')),
  trial_ends_at timestamptz,
  height_cm numeric,
  goal_weight_kg numeric,
  activity text,
  calories_target int,
  protein_target int,
  carbs_target int,
  fat_target int,
  tdee int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: crea el perfil solo al registrarse (username viaja en el metadata).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper anti-recursión para policies de admin.
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table profiles enable row level security;

drop policy if exists "profiles own select" on profiles;
create policy "profiles own select" on profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles own update" on profiles;
create policy "profiles own update" on profiles
  for update using (auth.uid() = id or public.is_admin());

-- username/role/tier/status solo los toca el dueño (prefs) o admin.
-- El RLS de update ya lo cubre; el whitelist de columnas va en la capa de app.

-- ── Dominio salud (migra data.json) ─────────────────────────────
create table if not exists meals (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal text not null,
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists meals_user_eaten_idx on meals (user_id, eaten_at desc);

create table if not exists workouts (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  duration_min int not null default 0,
  calories_burned numeric not null default 0,
  notes text not null default '',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_started_idx on workouts (user_id, started_at desc);

create table if not exists weights (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric not null,
  measured_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);
create index if not exists weights_user_measured_idx on weights (user_id, measured_at desc);

-- RLS own-rows en las tres.
alter table meals enable row level security;
alter table workouts enable row level security;
alter table weights enable row level security;

drop policy if exists "own rows" on meals;
create policy "own rows" on meals
  for all using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own rows" on workouts;
create policy "own rows" on workouts
  for all using (auth.uid() = user_id or public.is_admin());

drop policy if exists "own rows" on weights;
create policy "own rows" on weights
  for all using (auth.uid() = user_id or public.is_admin());
