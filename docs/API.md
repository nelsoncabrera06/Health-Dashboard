# API & MCP

Nutrition Dashboard exposes the same data the web app shows — meals, weights, workouts and daily
targets — so an agent or a script can read it and log new entries. There are two doors to the
same core: **MCP** for agents that speak the protocol, and a **REST API** for everything else.

- Public docs (rendered): **https://nutritiondashboard.vercel.app/developers**
- Create a key: **https://nutritiondashboard.vercel.app/api-keys**

---

## Authentication

Every request needs a header:

```
Authorization: Bearer hd_live_...
```

Keys are **per user**: a key can only see and write the data of its owner. The token is shown
once at creation; the database keeps only its SHA-256 hash, in a table with no policies.

The Supabase access token of a logged-in web session is also accepted (it belongs to the owner,
so it carries every scope). It is how the web app talks to the same endpoints.

### Scopes

| Scope | Allows |
|---|---|
| `health:read` | Read profile, summary, meals, weights, workouts. **Always included.** |
| `meals:write` | `POST /api/v1/meals`, `add_meal` |
| `weights:write` | `POST /api/v1/weights`, `log_weight` |
| `workouts:write` | `POST /api/v1/workouts`, `log_workout` |

A missing scope answers `403 scope_required` in REST, and an `isError` result with a readable
message in MCP.

### Expiry and limits

Expiry is chosen at creation: **90 days, 6 months or 1 year** (1 year maximum).

| Plan | Keys | Requests/day |
|---|---|---|
| `free` | 1 active | 1,000 |

Revoking a key is permanent and frees its slot: an expired or revoked key never works again,
you create a new one. Deleting removes the row and its usage counter.

---

## MCP

- Endpoint: `POST https://nutritiondashboard.vercel.app/api/mcp`
- Transport: **Streamable HTTP, stateless** — no session id, one server per request.
  `GET` and `DELETE` answer `405`.
- Without a token: `401` plus `WWW-Authenticate: Bearer`.
- Tools are discovered with `tools/list`; their descriptions carry the units, the date format
  and the rule to confirm with the user before writing.

### Tools

| Tool | Scope | What it does |
|---|---|---|
| `get_profile` | `health:read` | Profile, targets, TDEE, diets, timezone. **Start here.** |
| `get_day_summary` | `health:read` | Totals, remaining, burned, net. Default: today |
| `list_meals` | `health:read` | Meals in a range. Default: last 7 days |
| `list_weights` | `health:read` | Weigh-ins in a range. Default: last 30 days |
| `list_workouts` | `health:read` | Workouts in a range. Default: last 7 days |
| `add_meal` | `meals:write` | Log a meal with the macros the agent estimated |
| `log_weight` | `weights:write` | Log the day's weight (one per day, overwrites) |
| `log_workout` | `workouts:write` | Log a workout with duration and calories |

### Claude Code

```bash
claude mcp add --transport http nutrition \
  https://nutritiondashboard.vercel.app/api/mcp \
  --header "Authorization: Bearer hd_live_xxxxxxxx"
```

### JSON-configured clients (Claude Desktop, OpenClaw, Hermes…)

```json
{
  "mcpServers": {
    "health": {
      "type": "http",
      "url": "https://nutritiondashboard.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer hd_live_xxxxxxxx"
      }
    }
  }
}
```

---

## REST

Base: `https://nutritiondashboard.vercel.app/api/v1`

| Method | Path | Scope | Notes |
|---|---|---|---|
| `GET` | `/ping` | `health:read` | Connection test, no health data |
| `GET` | `/me` | `health:read` | Profile and targets |
| `GET` | `/summary?date=YYYY-MM-DD` | `health:read` | Default: today |
| `GET` | `/meals?from&to&limit` | `health:read` | Default: last 7 days, `limit` ≤ 500 |
| `POST` | `/meals` | `meals:write` | See body below |
| `GET` | `/weights?from&to` | `health:read` | Default: last 30 days |
| `POST` | `/weights` | `weights:write` | Upsert, one row per day |
| `GET` | `/workouts?from&to` | `health:read` | Default: last 7 days |
| `POST` | `/workouts` | `workouts:write` | See body below |

Successful responses use `{ data, meta }`; errors use `{ error, code }`. Add `?pretty=1` for
indented JSON (no need for `jq`).

> In zsh, quote the URL: `"…/meals?pretty=1"`. Without quotes the shell treats `?` as a glob
> and fails with `no matches found` before `curl` runs.

### Log a meal

```bash
curl -s -X POST "https://nutritiondashboard.vercel.app/api/v1/meals?pretty=1" \
  -H "Authorization: Bearer hd_live_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"Milanesa con puré","calories":780,"protein":42,
       "carbs":68,"fat":36,"client_ref":"milanesa-2026-11-22-1"}'
```

Body: `name` (1–120 chars), `calories` (0–10,000), optional `protein`, `carbs`, `fat`
(0–2,000 g each), optional `eaten_at` (ISO 8601, at most 1 day in the future) and optional
`client_ref` (≤ 64 chars).

Answers **201** with `{ meal, duplicated, day }`, where `day` is the recalculated summary for
the day the meal belongs to (not necessarily today).

**Idempotency:** send `client_ref` on every call. If the same value arrives again — a retry
after a timeout — the server returns **200** with the existing row and `duplicated: true`
instead of creating a second meal.

### Log a weight

```json
POST /api/v1/weights
{ "weight_kg": 95.4, "measured_at": "2026-11-22" }
```

`weight_kg` between 20 and 400. `measured_at` is date-only and optional: without it, "today" is
the user's timezone. There is one row per day — posting twice overwrites (answers 200).

### Log a workout

```json
POST /api/v1/workouts
{ "type": "running", "duration_min": 30, "calories_burned": 320, "notes": "easy pace" }
```

`type` 1–60 chars, `duration_min` 0–1,440, `calories_burned` 0–10,000, `notes` ≤ 500,
`started_at` optional ISO 8601. Answers **201**.

---

## Behaviour worth knowing

- **Day boundaries follow the user's timezone** (`profiles.timezone`, default
  `America/Buenos_Aires`), not UTC and not the server's timezone. A dinner at 21:00 -03 belongs
  to that day, not the next one.
- **The API does not estimate macros.** The chat in the web app uses our model (~±30% error);
  through the API the agent sends the values, so accuracy depends on the client's model. It is a
  tracking tool, not a scale.
- **No deletes.** Keys can read and log, never delete. Meals, weights, the account and the keys
  themselves are managed from the web, with confirmation.
- **The demo account has no keys.** It is public: anyone enters with a button, so a key there
  would be open write access.
- **Errors never leak internals:** validation problems answer 400 with a stable `code`
  (`invalid_name`, `invalid_calories`, `invalid_eaten_at`…), auth problems 401, permissions 403,
  rate limit 429.
