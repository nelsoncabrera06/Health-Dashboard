# Seed de la cuenta demo (demo@health.local) con datos de ejemplo.
# Uso: python3 scripts/seed_demo.py
# Idempotente: borra las filas previas del demo y las regenera.
import datetime as dt
import json
import urllib.request

DEMO_ID = "107c23b5-15c0-42d6-9fcf-b45c7814be45"


def load_env(path=".env"):
    env = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


env = load_env()
BASE = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {
    "apikey": KEY,
    "Authorization": "Bearer " + KEY,
    "Content-Type": "application/json",
}


def req(method, path, body=None):
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=H,
        method=method,
    )
    with urllib.request.urlopen(r) as res:
        raw = res.read().decode()
        return json.loads(raw) if raw else None


TODAY = dt.date(2026, 10, 16)

# ── Limpieza previa ──
for t in ("meals", "workouts", "weights"):
    req("DELETE", f"/rest/v1/{t}?user_id=eq.{DEMO_ID}")

# ── Pesos (bajada gradual) ──
weights = [
    ("2026-10-07", 96.8),
    ("2026-10-08", 96.6),
    ("2026-10-10", 96.3),
    ("2026-10-12", 96.1),
    ("2026-10-14", 95.7),
    ("2026-10-16", 95.4),
]
req("POST", "/rest/v1/weights", [
    {"user_id": DEMO_ID, "weight_kg": w, "measured_at": d}
    for d, w in weights
])

# ── Comidas: últimos 7 días, ~2000 kcal/día ──
MENU = [
    ("Desayuno: café con leche + 2 tostadas con queso untable", 320, 12, 45, 9, "08:00"),
    ("Almuerzo: pollo a la plancha con arroz y ensalada", 620, 45, 60, 18, "13:00"),
    ("Merienda: yogur con granola y banana", 280, 12, 45, 6, "17:00"),
    ("Cena: tortilla de verduras + ensalada de tomate", 480, 20, 25, 30, "21:00"),
]
VARIANTS = {
    1: ("Almuerzo: pasta con salsa de tomate y queso rallado", 680, 25, 95, 20, "13:00"),
    3: ("Cena: pescado al horno con papas y ensalada", 520, 35, 45, 20, "21:00"),
    5: ("Almuerzo: hamburguesa casera con ensalada (sin pan)", 590, 40, 20, 38, "13:00"),
}
meals = []
for i in range(7):
    day = (TODAY - dt.timedelta(days=6 - i)).isoformat()
    for j, m in enumerate(MENU):
        if i in VARIANTS and j == (1 if "Almuerzo" in VARIANTS[i][0] else 3):
            m = VARIANTS[i]
        name, cal, p, c, f, hour = m
        qty = 1.0 if i % 2 == 0 else 0.9  # varía un poco por día
        meals.append({
            "user_id": DEMO_ID,
            "meal": name,
            "calories": round(cal * qty),
            "protein": round(p * qty),
            "carbs": round(c * qty),
            "fat": round(f * qty),
            "eaten_at": f"{day}T{hour}:00",
        })
# Hoy solo hasta el almuerzo (demo "en curso")
meals = [m for m in meals if not (m["eaten_at"].startswith("2026-10-16") and m["eaten_at"][11:] > "13:30")]
req("POST", "/rest/v1/meals", meals)

# ── Ejercicios ──
req("POST", "/rest/v1/workouts", [
    {"user_id": DEMO_ID, "type": "Running", "duration_min": 30,
     "calories_burned": 350, "notes": "3km ritmo suave",
     "started_at": "2026-10-11T09:00:00"},
    {"user_id": DEMO_ID, "type": "Gym", "duration_min": 60,
     "calories_burned": 450, "notes": "Tren superior + 15min bici",
     "started_at": "2026-10-13T18:00:00"},
    {"user_id": DEMO_ID, "type": "Caminar", "duration_min": 45,
     "calories_burned": 200, "notes": "Caminata con el perro",
     "started_at": "2026-10-15T08:30:00"},
])

# ── Perfil demo con targets genéricos ──
req("PATCH", f"/rest/v1/profiles?id=eq.{DEMO_ID}", {
    "display_name": "Demo",
    "calories_target": 2200,
    "protein_target": 150,
    "carbs_target": 220,
    "fat_target": 70,
    "height_cm": 178,
    "goal_weight_kg": 90,
})

print(f"OK: {len(weights)} pesos, {len(meals)} comidas, 3 workouts + perfil")
