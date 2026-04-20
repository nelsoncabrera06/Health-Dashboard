#!/usr/bin/env python3
"""Health Dashboard Server - port 3000"""

import csv
import io
import json
import os
import sys
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
HTML_FILE = os.path.join(BASE_DIR, "index.html")


def load_data():
    with open(DATA_FILE, "r") as f:
        return json.load(f)


def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class HealthHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}", file=sys.stderr)

    def send_cors(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        for k, v in CORS_HEADERS.items():
            self.send_header(k, v)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors(204)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/" or path == "/index.html":
            try:
                with open(HTML_FILE, "rb") as f:
                    content = f.read()
                self.send_cors(200, "text/html; charset=utf-8")
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_cors(404)
                self.wfile.write(b'{"error": "index.html not found"}')

        elif path == "/health-data":
            try:
                data = load_data()
                body = json.dumps(data).encode()
                self.send_cors(200)
                self.wfile.write(body)
            except Exception as e:
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif path == "/export-csv":
            try:
                data = load_data()
                meals = data.get("meals", [])
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(["date", "time", "meal", "calories", "protein_g", "carbs_g", "fat_g"])
                for m in sorted(meals, key=lambda x: x.get("timestamp", 0)):
                    ts = m.get("timestamp", 0)
                    dt = datetime.fromtimestamp(ts, tz=timezone.utc).astimezone()
                    date_str = dt.strftime("%Y-%m-%d")
                    time_str = dt.strftime("%H:%M")
                    writer.writerow([
                        date_str,
                        time_str,
                        m.get("meal", ""),
                        m.get("calories", 0),
                        m.get("protein", 0),
                        m.get("carbs", 0),
                        m.get("fat", 0),
                    ])
                csv_bytes = buf.getvalue().encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", "attachment; filename=health-data.csv")
                for k, v in CORS_HEADERS.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(csv_bytes)
            except Exception as e:
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        else:
            self.send_cors(404)
            self.wfile.write(b'{"error": "Not found"}')

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length > 0 else b"{}"

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.send_cors(400)
            self.wfile.write(b'{"error": "Invalid JSON"}')
            return

        if path == "/log-meal":
            required = {"meal", "calories", "protein", "carbs", "fat", "timestamp"}
            missing = required - payload.keys()
            if missing:
                self.send_cors(400)
                self.wfile.write(json.dumps({"error": f"Missing fields: {list(missing)}"}).encode())
                return
            try:
                data = load_data()
                data["meals"].append({
                    "meal":      str(payload["meal"]),
                    "calories":  float(payload["calories"]),
                    "protein":   float(payload["protein"]),
                    "carbs":     float(payload["carbs"]),
                    "fat":       float(payload["fat"]),
                    "timestamp": int(payload["timestamp"]),
                })
                save_data(data)
                self.send_cors(200)
                self.wfile.write(b'{"status": "ok"}')
            except Exception as e:
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif path == "/log-workout":
            required = {"type", "duration_min", "calories_burned", "timestamp"}
            missing = required - payload.keys()
            if missing:
                self.send_cors(400)
                self.wfile.write(json.dumps({"error": f"Missing fields: {list(missing)}"}).encode())
                return
            try:
                data = load_data()
                data["workouts"].append({
                    "type":           str(payload["type"]),
                    "duration_min":   int(payload["duration_min"]),
                    "calories_burned": float(payload["calories_burned"]),
                    "notes":          str(payload.get("notes", "")),
                    "timestamp":      int(payload["timestamp"]),
                })
                save_data(data)
                self.send_cors(200)
                self.wfile.write(b'{"status": "ok"}')
            except Exception as e:
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        elif path == "/log-weight":
            if "weight_kg" not in payload:
                self.send_cors(400)
                self.wfile.write(b'{"error": "Missing field: weight_kg"}')
                return
            try:
                data = load_data()
                today = datetime.now().strftime("%Y-%m-%d")
                entry = {
                    "date":      str(payload.get("date", today)),
                    "weight_kg": float(payload["weight_kg"]),
                    "timestamp": int(datetime.now().timestamp()),
                }
                if "weight_log" not in data:
                    data["weight_log"] = []
                data["weight_log"].append(entry)
                save_data(data)
                self.send_cors(200)
                self.wfile.write(json.dumps({"status": "ok", "entry": entry}).encode())
            except Exception as e:
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        else:
            self.send_cors(404)
            self.wfile.write(b'{"error": "Not found"}')


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    print(f"🏋️  Health server running on http://0.0.0.0:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.", flush=True)
