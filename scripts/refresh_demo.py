#!/usr/bin/env python3
"""Desplaza temporalmente los datos del usuario demo para que el dataset quede pegado a hoy.

Lee los registros actuales del demo (meals/workouts/weights), calcula el offset en
días necesario para que el último registro caiga en AYER y reescribe todas las
fechas corridas ese offset. El contenido (menú, pesos, ejercicios) no se toca:
solo se mueve en el tiempo. Idempotente: si ya está al día, no hace nada.

Por qué el último registro cae en AYER y no en hoy (decisión de Nelson, 20-nov):
el demo no busca mostrar un día ya cargado, busca que el visitante ENTRE Y PRUEBE
el chat registrando una comida de hoy. Si el último registro quedara en hoy, el
panel del día en curso arrancaría con datos ajenos y la prueba se mezcla con el
seed. Con el corte en ayer, el panel de hoy arranca limpio y el visitante ve el
efecto de registrar su propia comida. El resto del dashboard (calorías de la
semana, peso, historial) igual se ve poblado, que es lo que se pedía.

Ojo: esto deja a propósito el panel de "hoy" vacío. NO es un bug. El día en curso
se calcula con lib/health.js:35 (getTodayMeals, gte(todayStartISO())).

Pensado para correr desde GitHub Actions cada 2 días (ver .github/workflows/).

Dos detalles que no son obvios y conviene no romper:
- El offset se calcula POR TABLA, no global. Si una corrida falla a mitad de
  camino, la tabla que quedó atrás se realinea sola en la corrida siguiente.
- `weights` tiene unique (user_id, measured_at) (001_users_and_health.sql:102),
  así que sus filas se mueven en dos fases (estacionar y después escribir) para
  no chocar consigo mismas. Un corrimiento de 1 día daba 409 duplicate key.

uso:
  python3 scripts/refresh_demo.py                 # usa el demo de NEXT_PUBLIC_DEMO_EMAIL
  python3 scripts/refresh_demo.py --user-id <uuid>
  python3 scripts/refresh_demo.py --dry-run
  python3 scripts/refresh_demo.py --force         # corre aunque ya esté al día

Variables de entorno requeridas:
  SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_DEMO_EMAIL si no se pasa --user-id

En local lee el .env del repo; en CI las toma del entorno.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Zona horaria del demo. Los timestamps de meals/workouts se escriben con este
# offset explícito para que el día "de hoy" que calcula el navegador
# (lib/health.js:29, todayStartISO) coincida con el día que vio el visitante.
TZ_OFFSET = timezone(timedelta(hours=-3))  # America/Buenos_Aires
TZ_LABEL = "America/Buenos_Aires"


def load_env_file(path):
    """Carga el .env sin dependencias, saltando comentarios inline."""
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        # "VAR=valor # nota" -> "valor"
        os.environ.setdefault(k.strip(), v.split(" #", 1)[0].strip().strip("'\""))


load_env_file(os.path.join(BASE, ".env"))

URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not URL or not KEY:
    sys.exit("faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno")

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}


class ApiError(Exception):
    pass


def api(method, path, body=None, prefer=None):
    h = dict(HEADERS)
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise ApiError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def parse_ts(s):
    """Parsea un timestamp ISO. Los que vienen sin zona se asumen con TZ_OFFSET."""
    s = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ_OFFSET)
    return dt


def find_demo_id(email):
    """Busca el user_id del demo por email vía la admin API (paginando)."""
    page = 1
    while page <= 20:
        res = api("GET", f"/auth/v1/admin/users?per_page=200&page={page}")
        users = res.get("users", res) if isinstance(res, dict) else res
        if not users:
            break
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
        page += 1
    sys.exit(f"no encontré el usuario demo con email {email}")


def main():
    ap = argparse.ArgumentParser(description="Corre los datos del demo para que 'hoy' tenga datos.")
    ap.add_argument("--user-id", help="UUID del usuario demo (si no, se resuelve por email)")
    ap.add_argument("--email", help="Email del demo (default: NEXT_PUBLIC_DEMO_EMAIL)")
    ap.add_argument("--dry-run", action="store_true", help="Muestra el offset y no escribe nada")
    ap.add_argument("--force", action="store_true", help="Corre aunque el demo ya esté al día")
    args = ap.parse_args()

    demo_id = args.user_id
    if not demo_id:
        email = args.email or os.environ.get("NEXT_PUBLIC_DEMO_EMAIL")
        if not email:
            sys.exit("falta --user-id, --email o NEXT_PUBLIC_DEMO_EMAIL en el entorno")
        demo_id = find_demo_id(email)
    print(f"demo: {demo_id}")

    # 1. Traer la data actual del demo.
    meals = api(
        "GET",
        f"/rest/v1/meals?select=id,eaten_at&user_id=eq.{demo_id}&order=eaten_at&limit=2000",
    ) or []
    workouts = api(
        "GET",
        f"/rest/v1/workouts?select=id,started_at&user_id=eq.{demo_id}&order=started_at&limit=2000",
    ) or []
    weights = api(
        "GET",
        f"/rest/v1/weights?select=id,measured_at&user_id=eq.{demo_id}&order=measured_at&limit=2000",
    ) or []

    if not meals and not workouts and not weights:
        sys.exit(
            "el demo no tiene datos: correr scripts/seed_demo.py una vez antes de automatizar"
        )

    # 2. Cada tabla calcula su propio offset contra ayer.
    #
    # Se hace por tabla y no con un offset global a propósito: si una corrida
    # anterior falló a mitad de camino, la tabla que quedó atrás se vuelve a
    # alinear sola en la próxima corrida en vez de arrastrar el desfasaje para
    # siempre. `weights.measured_at` es date (no timestamp), de ahí el [:10].
    target = date.today() - timedelta(days=1)

    def table_offset(dates):
        """Días a correr para que la fecha máxima de la tabla caiga en ayer."""
        return (target - max(dates)).days if dates else 0

    meal_dates = [parse_ts(m["eaten_at"]).date() for m in meals if m.get("eaten_at")]
    workout_dates = [
        parse_ts(w["started_at"]).date() for w in workouts if w.get("started_at")
    ]
    weight_dates = [
        date.fromisoformat(str(w["measured_at"])[:10])
        for w in weights
        if w.get("measured_at")
    ]

    off_meals = table_offset(meal_dates)
    off_workouts = table_offset(workout_dates)
    off_weights = table_offset(weight_dates)

    for name, off, ds in (
        ("meals", off_meals, meal_dates),
        ("workouts", off_workouts, workout_dates),
        ("weights", off_weights, weight_dates),
    ):
        rng = f"{min(ds)} -> {max(ds)}" if ds else "sin datos"
        print(f"  {name:<9} {len(ds):>3} filas  [{rng}]  offset {off:+d}d")

    if min(off_meals, off_workouts, off_weights) < 0:
        print(
            "aviso: el demo tiene registros posteriores a ayer; se van a corregir "
            "hacia atrás (normal si ya se corrió el script hoy con otro criterio)"
        )

    if not any((off_meals, off_workouts, off_weights)) and not args.force:
        print("OK: el demo ya está al día, nada que hacer")
        return

    if args.dry_run:
        print("[dry-run] no se escribió nada")
        return

    # 3. Pesos primero: `weights` tiene unique (user_id, measured_at)
    # (001_users_and_health.sql:102), así que mover una fila puede chocar con la
    # fecha que todavía ocupa otra. Se hace en dos fases: primero se estacionan
    # todas las filas en un rango temporal lejano y después se escriben las
    # fechas finales. Sin esto, un corrimiento de 1 día da 409 duplicate key.
    PARK_BASE = date(2000, 1, 1)  # rango libre, el demo nunca tiene fechas de 2000
    if weights and off_weights:
        off = timedelta(days=off_weights)
        for i, w in enumerate(weights):
            api(
                "PATCH",
                f"/rest/v1/weights?id=eq.{w['id']}",
                {"measured_at": (PARK_BASE + timedelta(days=i)).isoformat()},
                prefer="return=minimal",
            )
        for w in weights:
            new_d = (date.fromisoformat(str(w["measured_at"])[:10]) + off).isoformat()
            api(
                "PATCH",
                f"/rest/v1/weights?id=eq.{w['id']}",
                {"measured_at": new_d},
                prefer="return=minimal",
            )

    # 4. Comidas y ejercicios. meals/workouts no tienen unique sobre la fecha,
    # así que se reescriben directo con un PATCH por fila, preservando la hora.
    if off_meals:
        off = timedelta(days=off_meals)
        for m in meals:
            new_dt = parse_ts(m["eaten_at"]) + off
            api(
                "PATCH",
                f"/rest/v1/meals?id=eq.{m['id']}",
                {"eaten_at": new_dt.astimezone(timezone.utc).isoformat()},
                prefer="return=minimal",
            )

    if off_workouts:
        off = timedelta(days=off_workouts)
        for w in workouts:
            new_dt = parse_ts(w["started_at"]) + off
            api(
                "PATCH",
                f"/rest/v1/workouts?id=eq.{w['id']}",
                {"started_at": new_dt.astimezone(timezone.utc).isoformat()},
                prefer="return=minimal",
            )

    # 5. Verificación: el último registro tiene que caer ayer, y hoy tiene que
    # quedar limpio (es el punto del ejercicio: el visitante carga su comida).
    chk = api(
        "GET",
        f"/rest/v1/meals?select=eaten_at&user_id=eq.{demo_id}"
        f"&order=eaten_at.desc&limit=1",
    ) or []
    chk_w = api(
        "GET",
        f"/rest/v1/weights?select=measured_at&user_id=eq.{demo_id}"
        f"&order=measured_at.desc&limit=1",
    ) or []
    last_meal = parse_ts(chk[0]["eaten_at"]).astimezone(TZ_OFFSET) if chk else None
    last_w = chk_w[0]["measured_at"] if chk_w else None

    print(f"último meal demo: {last_meal.isoformat() if last_meal else '-'}")
    print(f"último peso demo: {last_w or '-'}")

    if last_meal and last_meal.date() != target:
        sys.exit(f"verificación falló: el último meal quedó en {last_meal.date()}, esperaba {target}")
    if last_w and str(last_w)[:10] != target.isoformat():
        sys.exit(f"verificación falló: el último peso quedó en {last_w}, esperaba {target}")

    today_rows = api(
        "GET",
        f"/rest/v1/meals?select=id&user_id=eq.{demo_id}"
        f"&eaten_at=gte.{(target + timedelta(days=1)).isoformat()}T00:00:00-03:00",
    ) or []
    if today_rows:
        print(
            f"ojo: quedaron {len(today_rows)} comidas del demo en el día de hoy; "
            "el panel arranca con datos ajenos"
        )

    applied = {
        "meals": off_meals,
        "workouts": off_workouts,
        "weights": off_weights,
    }
    moved = ", ".join(f"{k} {v:+d}d" for k, v in applied.items() if v) or "nada"
    print(
        f"OK: demo alineado a ayer ({moved}); el día en curso queda libre "
        f"para que el visitante lo pruebe ({TZ_LABEL})"
    )


main()
