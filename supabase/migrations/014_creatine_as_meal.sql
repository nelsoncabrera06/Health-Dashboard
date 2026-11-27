-- 014 — Creatina unificada en `meals` (0 kcal + tag "Suplemento")
--
-- La fase 2 la había guardado en una tabla propia (`creatine_logs`), pero no
-- aparecía en "Últimas comidas" con el tag de suplemento ni la veían la API y
-- el MCP. Decisión de Nelson: registrarla como una comida de 0 kcal, igual que
-- la proteína en polvo.
--
-- Se migran las filas existentes y se elimina la tabla. La creatina pasa a ser
-- una `meal` con `source='supplement'` y nombre `Creatina (N g)`.
--
-- Ejecutar en Supabase → SQL editor.

do $$
begin
  if to_regclass('public.creatine_logs') is not null then
    insert into public.meals
      (user_id, meal, calories, protein, carbs, fat, eaten_at, source)
    select
      user_id,
      'Creatina (' || regexp_replace(grams::text, '\.0+$', '') || ' g)',
      0, 0, 0, 0,
      created_at,
      'supplement'
    from public.creatine_logs;

    drop table public.creatine_logs;
  end if;
end $$;
