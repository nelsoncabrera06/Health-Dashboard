#!/usr/bin/env python3
"""One-shot: migra data.json local a Supabase (usa service_role, correr 1 vez)."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

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
USER_ID = sys.argv[1] if len(sys.argv) > 1 else None
if not USER_ID:
    sys.exit("uso: python3 scripts/migrate_data_json.py <user_id>")

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}


def api(method, path, body=None, prefer=None):
    h = dict(HEADERS)
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


data = json.load(open(os.path.join(BASE, "data.json")))

# meals[] manda; daily_logs[] se ignora (doble fuente, ver plan)
meals = [
    {
        "user_id": USER_ID,
        "meal": m.get("meal", ""),
        "calories": m.get("calories", 0),
        "protein": m.get("protein", 0),
        "carbs": m.get("carbs", 0),
        "fat": m.get("fat", 0),
        "eaten_at": datetime.fromtimestamp(
            m.get("timestamp", 0), tz=timezone.utc
        ).isoformat(),
    }
    for m in data.get("meals", [])
]
for i in range(0, len(meals), 100):
    api("POST", "/rest/v1/meals", meals[i : i + 100])
print(f"meals: {len(meals)}")

workouts = [
    {
        "user_id": USER_ID,
        "type": w.get("type", ""),
        "duration_min": w.get("duration_min", 0),
        "calories_burned": w.get("calories_burned", 0),
        "notes": w.get("notes", ""),
        "started_at": datetime.fromtimestamp(
            w.get("timestamp", 0), tz=timezone.utc
        ).isoformat(),
    }
    for w in data.get("workouts", [])
]
for i in range(0, len(workouts), 100):
    api("POST", "/rest/v1/workouts", workouts[i : i + 100])
print(f"workouts: {len(workouts)}")

weights = [
    {"user_id": USER_ID, "weight_kg": w["weight_kg"], "measured_at": w["date"]}
    for w in data.get("weight_log", [])
    if "weight_kg" in w and "date" in w
]
if weights:
    api(
        "POST",
        "/rest/v1/weights?on_conflict=user_id,measured_at",
        weights,
        prefer="resolution=merge-duplicates,return=minimal",
    )
print(f"weights: {len(weights)}")

# Perfil + goals -> profiles (sin tocar role/tier/status)
p, g = data.get("profile", {}), data.get("goals", {})
patch = {
    "display_name": p.get("name"),
    "height_cm": p.get("height_cm"),
    "goal_weight_kg": p.get("goal_weight_kg"),
    "activity": p.get("activity"),
    "tdee": p.get("tdee"),
    "calories_target": g.get("calories_target"),
    "protein_target": g.get("protein_target"),
    "carbs_target": g.get("carbs_target"),
    "fat_target": g.get("fat_target"),
}
patch = {k: v for k, v in patch.items() if v is not None}
api("PATCH", f"/rest/v1/profiles?id=eq.{USER_ID}", patch, prefer="return=minimal")
print(f"profiles: {list(patch)}")
print("OK")
