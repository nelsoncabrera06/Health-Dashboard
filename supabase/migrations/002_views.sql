-- 002_views.sql
-- Vistas de lectura con datos del usuario (para mirar la DB a ojo).
-- No duplicamos username en las tablas: el JOIN lo hace la vista.
-- `security_invoker = true` = respetan el RLS del que consulta.

create or replace view meals_with_user with (security_invoker = true) as
select m.*, p.username, p.display_name, p.email
from meals m join profiles p on p.id = m.user_id;

create or replace view workouts_with_user with (security_invoker = true) as
select w.*, p.username, p.display_name, p.email
from workouts w join profiles p on p.id = w.user_id;

create or replace view weights_with_user with (security_invoker = true) as
select w.*, p.username, p.display_name, p.email
from weights w join profiles p on p.id = w.user_id;
