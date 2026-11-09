# Running Royale DeckLab in Docker

The whole app (the ASP.NET API **and** the React SPA) ships as a single image.
ASP.NET serves the built SPA from `wwwroot` and the API under `/api`, so there's
no separate web server, no CORS, and no dev proxy in production. All frontend
calls are same-origin (`/api/...`).

## Build

```bash
docker build -t royale-decklab:local .
```

Multi-stage:
1. **web** (`oven/bun`): `bun install` + `vite build` → `/client/dist`
2. **api** (`dotnet/sdk:10.0`): `dotnet publish -c Release`
3. **runtime** (`dotnet/aspnet:10.0`): API + SPA (`wwwroot`), ~268 MB

## Run

```bash
docker run -d --name royale-decklab \
  -p 3000:3000 \
  -e CLASH_ROYALE_API_KEY=<your-token> \
  -v royale-meta:/data \
  royale-decklab:local
```

Then open http://localhost:3000.

## Production (compose + Caddy)

This is how [royaledecklab.com](https://royaledecklab.com) runs. The repo-root
`compose.yaml` starts two containers:

- **app** — the image above, built from the repo. Publishes **no ports**; it is
  only reachable over the internal compose network, so `TRUST_PROXY_HEADERS=true`
  is safe without `TRUSTED_PROXY_IPS` (see the table below).
- **caddy** — reverse proxy on 80/443 with automatic Let's Encrypt certificates.
  Domains live in the repo-root `Caddyfile` (`www.` redirects to the bare domain).

Secrets come from a server-side `.env` next to `compose.yaml` (gitignored):

```bash
CLASH_ROYALE_API_KEY=<token bound to the server's IP>
ADMIN_TOKEN=<openssl rand -hex 32>
WEBHOOK_ENCRYPTION_KEY=<openssl rand -base64 32>
```

Launch/update:

```bash
docker compose up -d --build
```

`meta.db` lives on the named volume (`<project>_meta`); to seed it, stop the app
container and copy a prebuilt file to
`/var/lib/docker/volumes/<project>_meta/_data/meta.db`, chown it to uid `1654`
(the image's non-root app user), and start the app again.

### Auto-deploy

`.github/workflows/deploy.yml` deploys every push to `main`: it SSHes into the
server, runs `git pull` + `docker compose up -d --build`, prunes dangling
images, and smoke-tests `/healthz`. It needs two repo **Actions secrets**:

| Secret           | Value                                                        |
|------------------|--------------------------------------------------------------|
| `DEPLOY_HOST`    | The server's public IPv4                                     |
| `DEPLOY_SSH_KEY` | Private half of a dedicated deploy keypair (no passphrase) whose public half is in the server's `authorized_keys` |

### Configuration

| Env var                  | Purpose                                             | Default            |
|--------------------------|-----------------------------------------------------|--------------------|
| `CLASH_ROYALE_API_KEY`   | CR API token (see IP note below). **Never baked in.** | none (required for live meta) |
| `ADMIN_TOKEN`            | Shared secret for the admin endpoints (`POST /api/meta/refresh`, `POST /api/meta/epoch`, `GET /api/admin/stats`), sent as the `X-Admin-Token` header. Unset ⇒ those endpoints reject every request with 401, the same as a wrong token. | none (admin endpoints reject every request) |
| `TRUST_PROXY_HEADERS`    | Set to `true` when running behind a reverse proxy so `X-Forwarded-For` (one hop) supplies the client IP for per-IP rate limiting. A request whose proxy hop is one of Cloudflare's published ranges then takes the visitor from `CF-Connecting-IP` (Caddy doesn't trust Cloudflare, so it forwards Cloudflare's address). Leave unset if :3000 is reached directly. | unset |
| `TRUSTED_PROXY_IPS`      | Optional, with `TRUST_PROXY_HEADERS=true`: comma-separated proxy IPs and/or CIDRs (e.g. `10.0.0.5,172.16.0.0/12`). Pins `X-Forwarded-For` trust to those addresses so a client that reaches :3000 directly can't spoof its IP past the rate limiter. When unset, any direct connection is treated as the proxy — then :3000 must only be reachable via the proxy (firewall/private network). | unset |
| `ASPNETCORE_URLS`        | Bind address. Set to `http://0.0.0.0:3000` in-image. | `http://0.0.0.0:3000` |
| `WEBHOOK_ENCRYPTION_KEY` | Base64 of 32 random bytes (`openssl rand -base64 32`) that encrypts the Discord webhook tokens in `reminders.db`, next to `meta.db`. Unset or invalid ⇒ Discord reminders are switched off and the row is hidden. Changing it makes stored webhooks unreadable, so keep it with your other secrets. | unset (reminders off) |
| `Meta__DbPath`           | SQLite battle store path.                            | `/data/meta.db`    |

Locally you can pass the token with `--env-file .env` instead of `-e`.

### Admin endpoints

Force a meta rebuild or set a balance-patch boundary (both require `ADMIN_TOKEN`):

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" http://localhost:3000/api/meta/refresh
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"timestamp":"now"}' http://localhost:3000/api/meta/epoch
```

Season rollovers set the boundary automatically: a background watcher probes the
Path of Legend rankings for the next season id every hour and sets the epoch the
moment the new season appears. The manual endpoint is only needed for mid-season
balance hotfixes. Battles from before the boundary aren't deleted; they count at
reduced weight (`Meta__PreEpochWeight`, default `0.25`) until they age out of the
30-day window, so the meta stays populated between a Monday rollover and the next
war battle days.

### The `meta.db` volume

`meta.db` is **derived, regenerable data** (aggregated from the CR API), not source
of truth, and it's gitignored. Mount a volume at `/data` so it survives restarts:

- **Fresh volume** → starts empty; the background job rebuilds it from the CR API
  (needs a working key, see below). Until the first rebuild, meta-backed endpoints
  return empty results but the app runs.
- **Seed with existing data** → bind-mount a prebuilt file instead:
  `-v /abs/path/meta.db:/data/meta.db`, or with the compose setup copy it into
  the named volume (see the production section above). Everything cache-backed
  (`/api/meta/status`, `/api/score-decks`) works immediately, offline.

### Usage stats (`stats.db`)

Anonymous visitor counts live in `stats.db`, next to `meta.db` on the same `/data`
volume. Unlike `meta.db` it can't be rebuilt, so keep the volume. Nothing in it
identifies anyone: visitors and player tags are stored only as keyed hashes whose
key changes every month and is deleted once the month ends, and single visits are
deleted after 90 days, leaving only daily and monthly totals.

View them at `https://<host>/admin/stats` by entering `ADMIN_TOKEN`; the page keeps
it for the browser tab only, and that browser stops counting as a visitor. The
same data is at `GET /api/admin/stats` with the `X-Admin-Token` header.

## The IP-bound API key (important for cloud deploys)

CR API tokens are **locked to the calling machine's IP**. A token bound to your
dev machine returns **403** from inside a container / on a cloud host with a
different egress IP. When that happens the app logs the 403 and **falls back to
aggregating the stored `meta.db`**. It does not crash.

To get live meta rebuilds in the cloud, the host needs a **static egress IP** you
can register at https://developer.clashroyale.com:
- **Fly.io**: dedicated IPv4.
- **VPS / droplet** (DigitalOcean, Hetzner, …): fixed IP.
- Railway and similar: egress IP is generally **not** static, so live rebuilds
  won't work, but the app still serves a seeded `meta.db`.

## Public API caching in Cloudflare

The app caches successful public card/catalog and best-deck responses for five
minutes, separately by path, response encoding and meta version. Personalized
player, clan and admin endpoints do not use this output cache. Upstream errors
and startup responses are not stored in it.

After deploying the code, select `royaledecklab.com` in Cloudflare, open
**Caching > Cache Rules > Create rule**, name it **Public API JSON**, and select
**Custom filter expression > Edit expression**. Paste:

```text
(http.host eq "royaledecklab.com" and http.request.method eq "GET" and http.request.uri.path in {"/api/cards" "/api/cards/stats" "/api/best-decks"})
```

Set **Cache eligibility** to **Eligible for cache**. For **Edge TTL**, select
**Use cache-control header if present, bypass cache if not**. Leave **Browser TTL**
respecting existing headers, then deploy the rule. The API sends `public,
max-age=300`; do not override missing headers or error responses with a fixed TTL.
Leave the default cache key. These three routes ignore query parameters.

Request `https://royaledecklab.com/api/best-decks` twice with an ordinary GET
(not a browser hard refresh). The second response should show
`CF-Cache-Status: HIT` and an `Age` header. Check `/api/cards` and
`/api/cards/stats` the same way. A first request can show `MISS` at each edge
location. Meta refresh invalidates the origin cache immediately; edge copies
can remain for up to five minutes. Purge these three URLs to make a refresh
visible at the edge immediately.

Generation and upgrade advice share a CPU scheduler (one to four workers based
on available processors, 32 queued jobs, ten-second deadline). Identical work
shares a task and results are retained for 60 seconds after completion, with
512 entries per calculation cache. Collection changes, generator options and
meta versions produce distinct keys. Saturation returns `503`, `no-store` and
`Retry-After: 2`; the client retries once without showing the meta-reload notice.

See [Cloudflare's Cache Rules guide](https://developers.cloudflare.com/cache/how-to/cache-rules/create-dashboard/).

## Health checks

`GET /healthz` returns `200 {"status":"ok"}` and is exempt from rate limiting,
so point uptime monitors and orchestrator probes (compose `healthcheck`, k8s
liveness) at it. The runtime image ships no curl/wget, so probe it from outside
the container.

## Smoke test

```bash
curl http://localhost:3000/healthz                # {"status":"ok"}
curl http://localhost:3000/api/meta/status        # {"status":"ok","deckCount":...}
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/          # 200 (SPA)
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/builder   # 200 (SPA deep link)
curl http://localhost:3000/api/nope                # {"error":"Not found"} 404
```
