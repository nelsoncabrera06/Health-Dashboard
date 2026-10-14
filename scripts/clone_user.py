#!/usr/bin/env python3
"""One-shot: clona la data de un usuario a un usuario demo con fechas corridas.

El último registro (global entre meals/workouts/weights) queda en ayer,
preservando horas del día y espaciamiento relativo. Requiere service_role.

uso: python3 scripts/clone_user.py <demo_email> <demo_password> [--source <user_id>] [--force]
"""
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Lee .env sin dependencias (soporta comentarios inline " # ...")
for line in open(os.path.join(BASE, ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        v = v.split(" #", 1)[0].strip().strip("'\"")
        os.environ.setdefault(k.strip(), v)

URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

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
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0].startswith("-"):
        sys.exit(
            "uso: python3 scripts/clone_user.py <demo_email> <demo_password> "
            "[--source <user_id>] [--force]"
        )
    demo_email, demo_password = args[0], args[1]
    source_id = None
    force = "--force" in args
    if "--source" in args:
        source_id = args[args.index("--source") + 1]

    # 1. Origen: explícito o el usuario con más meals.
    if not source_id:
        rows = api("GET", "/rest/v1/meals?select=user_id&limit=1000") or []
        counts = {}
        for r in rows:
            counts[r["user_id"]] = counts.get(r["user_id"], 0) + 1
        if not counts:
            sys.exit("no hay meals en ningún usuario: nada que clonar")
        source_id = max(counts, key=counts.get)
    print(f"origen: {source_id}")

    # 2. Usuario demo: crear o reusar.
    try:
        created = api(
            "POST",
            "/auth/v1/admin/users",
            {
                "email": demo_email,
                "password": demo_password,
                "email_confirm": True,
                "user_metadata": {"username": demo_email.split("@")[0]},
            },
        )
        demo_id = created["id"]
        print(f"demo creado: {demo_email} ({demo_id})")
    except ApiError as e:
        if "already" not in str(e).lower() and "exists" not in str(e).lower():
            raise
        users = api("GET", "/auth/v1/admin/users?per_page=100") or {}
        lst = users.get("users", users) if isinstance(users, dict) else users
        match = [u for u in lst if u.get("email") == demo_email]
        if not match:
            sys.exit(f"el email ya existe pero no lo encuentro: {e}")
        demo_id = match[0]["id"]
        print(f"demo reusado: {demo_email} ({demo_id})")

    if demo_id == source_id:
        sys.exit("el demo no puede ser el mismo que el origen")

    # 3. Si el demo ya tiene data, solo seguir con --force (borrando primero).
    existing = (
        api("GET", f"/rest/v1/meals?select=id&user_id=eq.{demo_id}&limit=1") or []
    )
    if existing and not force:
        sys.exit(
            f"el demo ya tiene meals: re-correr con --force para borrar y re-clonar "
            f"(o usar otro email)"
        )
    if existing and force:
        for tbl in ("meals", "workouts", "weights"):
            api("DELETE", f"/rest/v1/{tbl}?user_id=eq.{demo_id}")
        print("data previa del demo borrada")

    # 4. Traer data del origen.
    meals = (
        api(
            "GET",
            f"/rest/v1/meals?select=meal,calories,protein,carbs,fat,eaten_at"
            f"&user_id=eq.{source_id}&order=eaten_at&limit=1000",
        )
        or []
    )
    workouts = (
        api(
            "GET",
            f"/rest/v1/workouts?select=type,duration_min,calories_burned,notes,started_at"
            f"&user_id=eq.{source_id}&order=started_at&limit=1000",
        )
        or []
    )
    weights = (
        api(
            "GET",
            f"/rest/v1/weights?select=weight_kg,measured_at"
            f"&user_id=eq.{source_id}&order=measured_at&limit=1000",
        )
        or []
    )
    profile = api("GET", f"/rest/v1/profiles?select=*&id=eq.{source_id}&limit=1") or []
    profile = profile[0] if profile else {}
    if not meals and not workouts and not weights:
        sys.exit("el origen no tiene data")
    print(f"origen: {len(meals)} meals, {len(workouts)} workouts, {len(weights)} weights")

    # 5. Offset en días para que el último registro caiga ayer.
    stamps = [parse_ts(m["eaten_at"]) for m in meals]
    stamps += [parse_ts(w["started_at"]) for w in workouts]
    max_date = max(stamps).date() if stamps else None
    wdates = [date.fromisoformat(w["measured_at"]) for w in weights]
    if wdates and (max_date is None or max(wdates) > max_date):
        max_date = max(wdates)
    yesterday = date.today() - timedelta(days=1)
    offset = yesterday - max_date
    print(f"último registro origen: {max_date} -> demo: {yesterday} (offset {offset.days}d)")
    if offset.days < 0:
        sys.exit("el origen ya tiene registros futuros: revisar a mano")

    # 6. Insertar copias con fechas corridas.
    new_meals = [
        {
            "user_id": demo_id,
            "meal": m["meal"],
            "calories": m["calories"],
            "protein": m["protein"],
            "carbs": m["carbs"],
            "fat": m["fat"],
            "eaten_at": (parse_ts(m["eaten_at"]) + offset).isoformat(),
        }
        for m in meals
    ]
    for i in range(0, len(new_meals), 100):
        api("POST", "/rest/v1/meals", new_meals[i : i + 100], prefer="return=minimal")
    new_workouts = [
        {
            "user_id": demo_id,
            "type": w["type"],
            "duration_min": w["duration_min"],
            "calories_burned": w["calories_burned"],
            "notes": w.get("notes") or "",
            "started_at": (parse_ts(w["started_at"]) + offset).isoformat(),
        }
        for w in workouts
    ]
    for i in range(0, len(new_workouts), 100):
        api(
            "POST", "/rest/v1/workouts", new_workouts[i : i + 100], prefer="return=minimal"
        )
    new_weights = [
        {
            "user_id": demo_id,
            "weight_kg": w["weight_kg"],
            "measured_at": (
                date.fromisoformat(w["measured_at"]) + offset
            ).isoformat(),
        }
        for w in weights
    ]
    if new_weights:
        api("POST", "/rest/v1/weights", new_weights, prefer="return=minimal")

    # 7. Perfil: mismos targets/stats, nombre Demo (el trigger ya creó la fila).
    patch = {
        "display_name": "Demo",
        "height_cm": profile.get("height_cm"),
        "goal_weight_kg": profile.get("goal_weight_kg"),
        "activity": profile.get("activity"),
        "tdee": profile.get("tdee"),
        "calories_target": profile.get("calories_target"),
        "protein_target": profile.get("protein_target"),
        "carbs_target": profile.get("carbs_target"),
        "fat_target": profile.get("fat_target"),
    }
    patch = {k: v for k, v in patch.items() if v is not None}
    api("PATCH", f"/rest/v1/profiles?id=eq.{demo_id}", patch, prefer="return=minimal")

    # 8. Verificación.
    chk_m = api(
        "GET",
        f"/rest/v1/meals?select=eaten_at&user_id=eq.{demo_id}"
        f"&order=eaten_at.desc&limit=1",
    )
    chk_w = api(
        "GET",
        f"/rest/v1/weights?select=measured_at&user_id=eq.{demo_id}"
        f"&order=measured_at.desc&limit=1",
    )
    print(f"demo: {len(new_meals)} meals, {len(new_workouts)} workouts, {len(new_weights)} weights")
    print(f"último meal demo: {chk_m[0]['eaten_at'] if chk_m else '-'}")
    print(f"último peso demo: {chk_w[0]['measured_at'] if chk_w else '-'}")
    print("OK - login con:", demo_email)


main()
