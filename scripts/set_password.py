#!/usr/bin/env python3
"""Cambia la password de un usuario (ej. el demo) via Admin API.

uso: python3 scripts/set_password.py <email> <nueva_password>
Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def main():
    if len(sys.argv) != 3:
        sys.exit("uso: python3 scripts/set_password.py <email> <nueva_password>")
    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2]
    if len(new_password) < 6:
        sys.exit("la nueva password debe tener al menos 6 caracteres")

    users = api("GET", "/auth/v1/admin/users?per_page=100") or {}
    lst = users.get("users", users) if isinstance(users, dict) else users
    match = [u for u in lst if (u.get("email") or "").lower() == email]
    if not match:
        sys.exit(f"no encontré usuario con email {email}")
    uid = match[0]["id"]

    api("PUT", f"/auth/v1/admin/users/{uid}", {"password": new_password})
    print(f"OK - password actualizada para {email}")


main()
