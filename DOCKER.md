# Running Royale DeckLab in Docker

The whole app — the ASP.NET API **and** the React SPA — ships as a single image.
ASP.NET serves the built SPA from `wwwroot` and the API under `/api`, so there's
no separate web server, no CORS, and no dev proxy in production. All frontend
calls are same-origin (`/api/...`).

## Build

```bash
docker build -t royale-decklab:local .
```

Multi-stage:
1. **web** (`oven/bun`) — `bun install` + `vite build` → `/client/dist`
2. **api** (`dotnet/sdk:10.0`) — `dotnet publish -c Release`
3. **runtime** (`dotnet/aspnet:10.0`) — API + SPA (`wwwroot`), ~268 MB

## Run

```bash
docker run -d --name royale-decklab \
  -p 3000:3000 \
  -e CLASH_ROYALE_API_KEY=<your-token> \
  -v royale-meta:/data \
  royale-decklab:local
```

Then open http://localhost:3000.

### Configuration

| Env var                  | Purpose                                             | Default            |
|--------------------------|-----------------------------------------------------|--------------------|
| `CLASH_ROYALE_API_KEY`   | CR API token (see IP note below). **Never baked in.** | — (required for live meta) |
| `ADMIN_TOKEN`            | Shared secret for the admin endpoints (`POST /api/meta/refresh`, `POST /api/meta/epoch`), sent as the `X-Admin-Token` header. Unset ⇒ those endpoints are disabled (403). | — (admin endpoints disabled) |
| `TRUST_PROXY_HEADERS`    | Set to `true` when running behind a reverse proxy so `X-Forwarded-For` (one hop) supplies the client IP for per-IP rate limiting. Leave unset if :3000 is reached directly. | unset |
| `ASPNETCORE_URLS`        | Bind address. Set to `http://0.0.0.0:3000` in-image. | `http://0.0.0.0:3000` |
| `Meta__DbPath`           | SQLite battle store path.                            | `/data/meta.db`    |

Locally you can pass the token with `--env-file .env` instead of `-e`.

### Admin endpoints

Force a meta rebuild or set a balance-patch boundary (both require `ADMIN_TOKEN`):

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:3000/api/meta/refresh
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"timestamp":"now"}' http://localhost:3000/api/meta/epoch
```

### The `meta.db` volume

`meta.db` is **derived, regenerable data** (aggregated from the CR API), not source
of truth — it's gitignored. Mount a volume at `/data` so it survives restarts:

- **Fresh volume** → starts empty; the background job rebuilds it from the CR API
  (needs a working key, see below). Until the first rebuild, meta-backed endpoints
  return empty results but the app runs.
- **Seed with existing data** → bind-mount a prebuilt file instead:
  `-v /abs/path/meta.db:/data/meta.db`. Everything cache-backed
  (`/api/meta/status`, `/api/score-decks`) works immediately, offline.

## The IP-bound API key (important for cloud deploys)

CR API tokens are **locked to the calling machine's IP**. A token bound to your
dev machine returns **403** from inside a container / on a cloud host with a
different egress IP. When that happens the app logs the 403 and **falls back to
aggregating the stored `meta.db`** — it does not crash.

To get live meta rebuilds in the cloud, the host needs a **static egress IP** you
can register at https://developer.clashroyale.com:
- **Fly.io** — dedicated IPv4.
- **VPS / droplet** (DigitalOcean, Hetzner, …) — fixed IP.
- Railway and similar — egress IP is generally **not** static; live rebuilds
  won't work, but the app still serves a seeded `meta.db`.

## Smoke test

```bash
curl http://localhost:3000/api/meta/status        # {"status":"ok","deckCount":...}
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/          # 200 (SPA)
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder   # 200 (SPA deep link)
curl http://localhost:3000/api/nope                # {"error":"Not found"} 404
```
