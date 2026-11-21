-- 007 — Borrado real de API keys y fin del audit log técnico
--
-- 1. `api_requests` se elimina: guardaba una fila por cada request HTTP de cada
--    agente (tool, path, status, ms). Es ruido técnico, no información del
--    usuario. Lo que importa — cuándo registró una comida, un peso o un
--    entrenamiento — ya vive en `created_at` de cada tabla y no se toca.
--
-- 2. `delete_api_key(p_key, p_user)` reemplaza al `on delete set null`: borra la
--    key y su uso asociado en una sola transacción, de modo que no queden filas
--    huérfanas ni basura acumulada. El filtro por `user_id` va adentro de la
--    función: se ejecuta con service_role, que bypassa RLS.

begin;

-- ── 1. Fin del audit log de requests ───────────────────────────
drop table if exists api_requests;

-- ── 2. Borrado transaccional de una key ────────────────────────
create or replace function public.delete_api_key(p_key uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- El dueño se verifica en el where, no en el cliente: sin esto, conocer un
  -- uuid alcanzaría para borrar la key de otro (service_role bypassa RLS).
  delete from api_keys
  where id = p_key and user_id = p_user
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  delete from api_usage where key_id = v_id;
  return true;
end;
$$;

revoke all on function public.delete_api_key(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_api_key(uuid, uuid) to service_role;

-- ── 3. `api_keys.revoked_at` es de solo ida ────────────────────
-- Revocar es definitivo: una key revocada no vuelve a autenticar nunca. Si hace
-- falta otra, se crea una nueva (o se elimina la revocada para no dejar rastro).
comment on column api_keys.revoked_at is
  'Si no es null, la key está revocada y no autentica nunca más. No se reactiva: se crea otra o se elimina.';

commit;

-- ── Verificación ───────────────────────────────────────────────
select to_regclass('public.api_requests') as api_requests_debe_ser_null;

select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_api_key';
