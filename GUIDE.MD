# Royale DeckLab

Recommends the best 4 non-overlapping Clash Royale war decks for a player, based on their card collection and current top-ladder meta.

## Architecture

- **`client/`**: React 18 + Vite SPA. Server state via TanStack Query (`src/queries.ts`); raw fetch helpers in `src/api.ts`.
- **`src/`**: ASP.NET Core (.NET 10) API. Serves the built SPA in production and exposes `/api/*`. Meta win-rates are aggregated from top war players' battle logs into SQLite (`meta.db`) by a background job.

## Run locally

```bash
# API: http://localhost:3000
dotnet run --project src/RoyaleDeckLab.Api

# SPA: http://localhost:5173 (proxies /api to :3000)
cd client && bun run dev
```

## Build / deploy

Single Docker image serves SPA + API. See [DOCKER.md](DOCKER.md).

## API key

The Clash Royale API key is **IP-locked**. Put a token bound to the calling machine's IP in `.env` (never committed):

```
CLASH_ROYALE_API_KEY=your_jwt_token_here
```

If the key can't reach the API (wrong IP), the app serves whatever is already in `meta.db` instead of crashing.
