-- 005_demo_seed.sql
-- Dataset de ejemplo para la cuenta demo (demo@health.local): 30 días de comidas,
-- ~25 pesajes y 12 entrenamientos. Reemplaza al seed corto de scripts/seed_demo.py
-- (7 días), que queda solo como referencia histórica.
--
-- Cómo correrla: SQL editor de Supabase (pegar todo y Run), o
--   psql "<connection string>" -f supabase/migrations/005_demo_seed.sql
--
-- Detalles que conviene no romper:
-- - Es IDEMPOTENTE: borra las filas del demo y las regenera. Correrla de nuevo
--   reescribe el dataset entero.
-- - Las fechas son relativas a current_date: el último registro cae en AYER y el
--   día de hoy queda vacío a propósito (el visitante prueba el chat cargando su
--   propia comida). Mismo criterio que scripts/refresh_demo.py:9-18.
-- - Los timestamps se escriben con zona America/Buenos_Aires para que el "hoy"
--   del navegador coincida con el día que ve el visitante.
-- - Si la cuenta demo cambia de id, actualizar _demo_seed y scripts/seed_demo.py.
-- - El workflow refresh-demo.yml sigue moviendo este dataset en el tiempo; no
--   hace falta volver a correr esta migración.

begin;

-- Una sola fila con el user_id del demo, para no repetir el UUID 40 veces.
create temporary table _demo_seed as
select '107c23b5-15c0-42d6-9fcf-b45c7814be45'::uuid as uid;

-- ── Limpieza (idempotencia) ─────────────────────────────────────
delete from meals    where user_id = (select uid from _demo_seed);
delete from workouts where user_id = (select uid from _demo_seed);
delete from weights  where user_id = (select uid from _demo_seed);

-- ── Comidas: 30 días × 4 comidas (08 / 13 / 17 / 21) ────────────
-- Menú rotativo: cada día toma una opción distinta por comida, así el gráfico
-- de calorías no queda con todas las barras iguales. La escala diaria varía
-- ±10% y sube un poco los fines de semana (barras en rojo sobre el límite).
with days as (
  select
    d,
    (current_date - 30 + d) as day,
    (1.10 + ((d * 7) % 5) * 0.04
      + case when extract(isodow from (current_date - 30 + d)) in (6, 7) then 0.06 else 0 end
    ) as scale
  from generate_series(0, 29) as d
),
menu as (
  select t.*, count(*) over (partition by t.slot) as n
  from (values
    -- slot 1: desayuno 08:00
    (1, 0, 'Desayuno: café con leche + 2 tostadas con queso untable', 330, 14, 44,  9, '08:00'),
    (1, 1, 'Desayuno: avena con leche, banana y nueces',               430, 18, 55, 14, '08:00'),
    (1, 2, 'Desayuno: 3 huevos revueltos con pan integral',            450, 28, 32, 24, '08:00'),
    (1, 3, 'Desayuno: yogur griego con granola y frutillas',           380, 26, 40, 12, '08:00'),
    (1, 4, 'Desayuno: tostadas con palta y 2 huevos',                  430, 22, 34, 24, '08:00'),
    -- slot 2: almuerzo 13:00
    (2, 0, 'Almuerzo: pollo a la plancha con arroz y ensalada',        690, 55, 65, 20, '13:00'),
    (2, 1, 'Almuerzo: pasta con salsa de tomate y queso rallado',      700, 28, 96, 22, '13:00'),
    (2, 2, 'Almuerzo: hamburguesa casera con ensalada (sin pan)',      620, 44, 18, 40, '13:00'),
    (2, 3, 'Almuerzo: milanesa de pollo con puré',                     740, 46, 66, 30, '13:00'),
    (2, 4, 'Almuerzo: bowl de quinoa, garbanzos y verduras',           580, 24, 72, 18, '13:00'),
    (2, 5, 'Almuerzo: empanadas de carne (2) con ensalada',            670, 30, 56, 34, '13:00'),
    -- slot 3: merienda 17:00
    (3, 0, 'Merienda: yogur con granola y banana',                     310, 18, 44,  8, '17:00'),
    (3, 1, 'Merienda: café con leche + 2 medialunas',                  360, 10, 46, 15, '17:00'),
    (3, 2, 'Merienda: tostada con queso y tomate',                     240, 14, 24, 10, '17:00'),
    (3, 3, 'Merienda: fruta + puñado de almendras',                    250,  8, 28, 13, '17:00'),
    (3, 4, 'Merienda: licuado de banana con leche y avena',            330, 15, 52,  8, '17:00'),
    -- slot 4: cena 21:00
    (4, 0, 'Cena: tortilla de verduras + ensalada de tomate',          500, 24, 26, 32, '21:00'),
    (4, 1, 'Cena: pescado al horno con papas y ensalada',              560, 42, 46, 22, '21:00'),
    (4, 2, 'Cena: fideos con tuco y queso',                            640, 28, 82, 22, '21:00'),
    (4, 3, 'Cena: pechuga de pollo con verduras al horno',             520, 48, 26, 22, '21:00'),
    (4, 4, 'Cena: pizza casera de muzarella (2 porciones)',            720, 30, 86, 28, '21:00')
  ) as t(slot, idx, name, kcal, protein, carbs, fat, hour)
),
picked as (
  select dy.day, dy.scale, m.name, m.kcal, m.protein, m.carbs, m.fat, m.hour
  from days dy
  join menu m on m.idx = (dy.d * 3 + m.slot * 5) % m.n
)
insert into meals (user_id, meal, calories, protein, carbs, fat, eaten_at)
select
  (select uid from _demo_seed),
  p.name,
  round(p.kcal * p.scale),
  round(p.protein * p.scale),
  round(p.carbs * p.scale),
  round(p.fat * p.scale),
  (p.day::text || ' ' || p.hour)::timestamp at time zone 'America/Buenos_Aires'
from picked p;

-- ── Pesos: bajada gradual 97.x → 95.x con ruido y algún día sin pesarse ──
insert into weights (user_id, weight_kg, measured_at)
select
  (select uid from _demo_seed),
  round((97.4 - d * 0.07 + (((d * 7) % 5) - 2) * 0.15)::numeric, 1),
  (current_date - 30 + d)
from generate_series(0, 29) as d
where (d * 11) % 7 <> 0;  -- ~5 días sin registro, como en la vida real

-- ── Entrenamientos: 12 en el mes, mezclando tipos ──────────────
insert into workouts (user_id, type, duration_min, calories_burned, notes, started_at)
select
  (select uid from _demo_seed),
  t.type, t.dur, t.kcal, t.notes,
  ((current_date - 30 + t.d)::text || ' ' || t.hour)::timestamp
    at time zone 'America/Buenos_Aires'
from (values
  ( 2, 'Running', 30, 350, '3 km ritmo suave',              '09:00'),
  ( 5, 'Gym',     60, 450, 'Tren superior + 15 min bici',    '18:00'),
  ( 7, 'Caminar', 45, 200, 'Caminata con el perro',          '08:30'),
  ( 9, 'Gym',     55, 420, 'Piernas completo',               '19:00'),
  (12, 'Bici',    50, 380, 'Salida por la costanera',        '10:00'),
  (14, 'Running', 35, 400, '4 km progresivo',                '09:30'),
  (16, 'Gym',     60, 460, 'Espalda y bíceps',               '18:30'),
  (19, 'Caminar', 40, 180, 'Caminata al mediodía',           '12:30'),
  (21, 'Gym',     65, 480, 'Tren inferior + core',           '19:00'),
  (24, 'Running', 30, 340, '3 km + estiramiento',            '08:00'),
  (26, 'Bici',    45, 350, 'Rodillo en casa',                '20:00'),
  (29, 'Gym',     55, 430, 'Full body',                      '18:00')
) as t(d, type, dur, kcal, notes, hour);

-- ── Perfil: completar los datos que el wizard deja seteados ─────
update profiles set
  sex = 'male',
  age = 30,
  country = 'AR',
  goal_type = 'fat_loss',
  activity = 'moderate',
  height_cm = 178,
  goal_weight_kg = 90,
  calories_target = 2200,
  protein_target = 150,
  carbs_target = 220,
  fat_target = 70,
  tdee = 2910,
  diet_tags = '{}',
  supplements = '{}',
  supplements_other = null
where id = (select uid from _demo_seed);

drop table _demo_seed;

commit;

-- ── Verificación (devuelve una fila por tabla) ─────────────────
select
  'meals' as tabla, count(*) as filas,
  min(eaten_at)::date as desde, max(eaten_at)::date as hasta,
  round(avg(calories)) as prom_kcal
from meals where user_id = '107c23b5-15c0-42d6-9fcf-b45c7814be45'
union all
select 'weights', count(*), min(measured_at), max(measured_at), round(avg(weight_kg), 1)
from weights where user_id = '107c23b5-15c0-42d6-9fcf-b45c7814be45'
union all
select 'workouts', count(*), min(started_at)::date, max(started_at)::date,
       sum(calories_burned)
from workouts where user_id = '107c23b5-15c0-42d6-9fcf-b45c7814be45';
