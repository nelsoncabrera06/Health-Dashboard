# USERS.md — Patrón de usuarios (base reutilizable)

> Origen: probado con usuarios reales en `fixture-mundial-2026`
> (`lib/auth.js`, `lib/supabaseClient.js`, `components/AuthContext.js`,
> `app/api/admin/delete-user/route.js`). No copiar el de `Festival-Match`
> (auth propio con bcrypt + sesiones en DB: no es serverless-friendly).

## Reglas de oro
1. **Nunca guardar passwords propios.** Auth (email+password, hash, sesiones,
   recovery, OAuth) lo maneja Supabase Auth (`auth.users`).
2. **Una fila en `profiles` por cada `auth.users.id`.** Se crea sola con un
   trigger en el sign-up. La app solo lee/escribe `profiles` + tablas de dominio.
3. **RLS en todas las tablas.** Filas propias (`auth.uid() = user_id`), lectura
   pública solo para datos realmente públicos. `service_role` jamás va al cliente.
4. **Roles y tiers separados.** `role`: `user`/`admin`. `tier`: `free`/`pro`/`premium`
   (no usar `plus`). `trial` no es un tier: es `status = 'trial'` + `trial_ends_at`.
5. **Migraciones versionadas en `supabase/migrations/`.** Nada creado a mano en el
   dashboard sin su archivo SQL (error que cometimos en el fixture: solo quedó
   `add_penalty_columns.sql`).

## Schema base
- `profiles(id uuid PK → auth.users.id ON DELETE CASCADE, email, username UNIQUE,`
  `display_name, role, tier, status, trial_ends_at, created_at, updated_at)`
  + columnas de dominio del proyecto (en salud: targets, altura, etc.).
- Tablas de dominio con `user_id uuid → auth.users.id ON DELETE CASCADE`
  (ej: `meals`, `workouts`, `weights`). Borrar el usuario de Auth borra todo en cascada.
- Trigger `handle_new_user()` on `auth.users` INSERT: crea `profiles` con
  `username` del metadata del sign-up. La función es `SECURITY DEFINER`.
- Helper `is_admin() SECURITY DEFINER` (lee `profiles.role` sin recursión de RLS)
  para las policies de admin.
- Policies por tabla: `select/update/insert/delete own rows`
  (`auth.uid() = user_id`), admin full vía `is_admin()`, público solo `SELECT`
  donde aplique.

## Capas de código (Next.js, como en el fixture)
- `lib/supabaseClient.js`: un solo cliente con `URL` + `ANON_KEY` (públicas).
  Sesión en localStorage con auto-refresh; nunca manejar tokens a mano.
- `lib/auth.js`: `register` (signUp + metadata username), `login`
  (signInWithPassword), `signInWithGoogle` (OAuth con `redirectTo: origin`),
  `signOut`, `getCurrentUser` (sesión + `profiles` por id), `changePassword`
  (re-autentica antes de `updateUser`), `setUserPrefs` (whitelist de campos),
  `listUsers`/`updateUser` (admin, amparados por RLS), `deleteAccount`/
  `adminDeleteUser` (vía ruta server).
- `components/AuthContext.js`: `getCurrentUser()` inicial + `onAuthStateChange`
  para re-leer en cada cambio de sesión. Expone `user, ready, signIn, signOut…`.
- `app/api/admin/delete-user/route.js`: única ruta con `SUPABASE_SERVICE_ROLE_KEY`.
  Valida `Authorization: Bearer <token>` con `getUser(token)`, chequea
  `profiles.role`, permite si `isAdmin || caller == target`, borra con
  `admin.auth.admin.deleteUser` (profiles cae en cascada).
- Errores traducidos a mensajes legibles (`translateError`: duplicado, password corto).

## Env vars
```
# Públicas (bundle del cliente)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Secreta, SOLO servidor (sin prefijo NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=...
```
En backend no-Next (Python/Express): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Local en `.env` (ignorado); en Vercel a mano en el dashboard.

## Tiers
- `tier`: `free` / `pro` / `premium`. Chequeo en lógica de app (límites de uso),
  no en RLS.
- Trial: `status='trial'` + `trial_ends_at`. Al vencer, `status` vuelve a `active`
  con `tier='free'` (job o chequeo al leer perfil).

## Checklist para proyecto nuevo
- [ ] Crear proyecto Supabase, copiar URL + anon + service_role.
- [ ] Migración `001_users.sql`: `profiles` + trigger + `is_admin()` + RLS.
- [ ] Migración `002_<dominio>.sql`: tablas con `user_id` + RLS own-rows.
- [ ] `Confirm email` desactivado en dev (sesión inmediata); activado en prod.
- [ ] Google OAuth: redirect URL de prod + local en Supabase y Google Cloud.
- [ ] Ruta admin delete-user (o equivalente según stack) con service_role solo server.
- [ ] Probar: register → perfil auto-creado, login, Google, RLS (usuario A no ve filas de B), admin lista/borra, delete propia.
