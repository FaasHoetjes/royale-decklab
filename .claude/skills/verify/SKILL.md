---
name: verify
description: Build, launch, and drive the Royale DeckLab API + SPA to verify changes end-to-end.
---

# Verifying Royale DeckLab

## Launch

```bash
cd src/RoyaleDeckLab.Api && dotnet run   # binds http://localhost:3000
```

- Startup serves from the existing `meta.db` at the repo root (no crawl if the
  last build is < 24h old). A fresh crawl only happens when the store is empty
  or stale — it burns CR API quota, so avoid triggering it needlessly.
- `CLASH_ROYALE_API_KEY` comes from the repo-root `.env` (IP-bound; player and
  cards fetches work from the dev machine's IP).
- Readiness: poll `GET /healthz` until 200.

## Drive

```bash
curl -s http://localhost:3000/healthz                    # 200, rate-limit exempt
curl -s http://localhost:3000/api/meta/status            # deckCount > 0 when meta.db seeded
curl -s http://localhost:3000/api/cards                  # upstream fetch, then cached
curl -s http://localhost:3000/api/best-decks             # ~60ms cold, ~3ms cached per meta version
curl -s "http://localhost:3000/api/player/%23<TAG>/upgrades"  # TAG must be #-prefixed (URL-encoded %23)
```

Gotchas learned the hard way:
- **Player tags need the `#`** (`%23` in the URL). Bare tags reach the CR API
  unprefixed and 404 even for real players. The SPA prepends `#` before fetching.
- Real player tags for testing: `SELECT DISTINCT player_tag FROM battles LIMIT 3`
  against `meta.db` (python's sqlite3 works; WAL mode allows concurrent reads).
- Rate limits (per IP, 1-min fixed windows): player endpoints 30, admin 5,
  global backstop 300. A probe burst pollutes the window for ~1 min.
- `POST /api/meta/epoch` **deletes battles** before the boundary — never fire it
  against the real `meta.db` during verification.
- Admin endpoints return 403 when `ADMIN_TOKEN` is unset, 401 on wrong token.

## Client

`cd client && bun run dev` (Vite on :5173, proxies `/api` to :3000). For API-only
changes, curl against :3000 is enough — the SPA is same-origin static files in prod.
