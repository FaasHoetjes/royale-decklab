# Royale DeckLab

Recommends the best 4 non-overlapping Clash Royale war decks for a player, based on their card collection and the current Clan War meta.

## Architecture

- **`client/`**: React 19 + Vite SPA, using bun. Server state via TanStack Query (`client/src/queries.ts`); raw fetch helpers in `client/src/api.ts`.
- **`src/`**: ASP.NET Core (.NET 10) API. Serves the built SPA in production and exposes `/api/*`. Meta win rates are aggregated from top war players' battle logs into SQLite (`meta.db`) by a background job. Discord reminders live in `reminders.db` and visitor stats in `stats.db`, next to `meta.db`.

## Run locally

```bash
# API: http://localhost:3000
dotnet run --project src/RoyaleDeckLab.Api

# SPA: http://localhost:5173 (proxies /api to :3000)
cd client && bun install && bun run dev
```

## Tests

```bash
# Client tests and type check
cd client && bun test && bun run typecheck

# API tests
dotnet test src/RoyaleDeckLab.Api.Tests
```

## Build / deploy

Single Docker image serves SPA + API. See [DOCKER.md](DOCKER.md).

## Environment

Settings go in `.env` at the repo root (never committed); the API loads it on startup.

The Clash Royale API key is **IP-locked**. Use a token bound to the calling machine's IP:

```
CLASH_ROYALE_API_KEY=your_jwt_token_here
```

If the key can't reach the API (wrong IP), the app serves whatever is already in `meta.db` instead of crashing.

Two optional settings switch on extra features:

```
# Admin endpoints; unset, they reject every request
ADMIN_TOKEN=<openssl rand -hex 32>

# Encrypts Discord webhooks; unset, Discord reminders are off
WEBHOOK_ENCRYPTION_KEY=<openssl rand -base64 32>
```

See [DOCKER.md](DOCKER.md) for every setting.
