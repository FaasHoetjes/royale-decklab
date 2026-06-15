# Royale DeckLab - War Deck Builder

A Clash Royale web application that recommends the best 4 non-overlapping war decks for any player based on their card collection and current meta performance.

## Quick Start

### Prerequisites
- Bun v1.3.6+ (https://bun.sh)
- A Clash Royale API key from https://developer.clashroyale.com
- Your Clash Royale player tag (e.g., `#2QGG92L9`)

### Running the Application

**Terminal 1 - Start the backend server:**
```bash
bun run src/server.ts
```
The server will start on `http://localhost:3000` and attempt to build the meta database from top player battle logs.

**Terminal 2 - Start the frontend dev server:**
```bash
cd web
bun run dev
```
Open your browser to `http://localhost:5173`

## Architecture

### Backend (`src/`)
- **`api/player.ts`** — Fetches individual player data from Clash Royale API
- **`api/meta.ts`** — Fetches top players and their battle logs
- **`services/metaBuilder.ts`** — Builds a win-rate database from top-1000 players' recent battles
- **`services/deckAnalyzer.ts`** — Scores decks based on player's card levels and meta win rates, finds 4 non-overlapping decks
- **`server.ts`** — Bun HTTP server with endpoints:
  - `GET /api/player/:tag` — Returns player data + 4 recommended war decks
  - `GET /api/meta/status` — Returns meta cache status
  - `POST /api/meta/refresh` — Force-refresh meta cache (development)

### Frontend (`web/`)
- **React 18 + Vite 5** — Fast dev server, optimized build
- **Components:**
  - `PlayerSearch.tsx` — Search form for player tags
  - `DeckCard.tsx` — Display single 8-card deck with stats
  - `WarDeckResult.tsx` — Show all 4 recommended decks

## How It Works

1. **Meta Database** — On server startup, the backend fetches the top 200 global players and their last 25 ranked battles each. It groups identical 8-card decks and calculates win rates.

2. **Player Lookup** — User enters their tag. Backend fetches their card levels and collection.

3. **Deck Scoring** — For each meta deck:
   - Check if player owns all 8 cards
   - Score = `meta_win_rate × avg_card_level_ratio`
   - `avg_card_level_ratio` = average of (player_level / max_level) for each card

4. **4-Deck Selection** — Greedy algorithm:
   - Sort decks by score descending
   - Pick highest-scored deck
   - Pick next highest that shares no cards with already-picked decks
   - Repeat until 4 decks selected

## API Key Setup

The Clash Royale API requires tokens to be **IP-locked** to your server's IP. 

1. Go to https://developer.clashroyale.com
2. Create a new token and bind it to your machine's IP
3. Add the token to `.env`:
   ```
   CLASH_ROYALE_API_KEY=your_jwt_token_here
   ```

## Meta Cache

The meta database is cached in `meta-cache.json` and refreshed every 24 hours. You can force a refresh via:
```bash
curl -X POST http://localhost:3000/api/meta/refresh
```

If the API is unreachable (due to IP-locking), the server will log a warning and continue with an empty meta database. Decks will still be returned, just without meta scores.

## Project Structure

```
royale-decklab/
├── src/
│   ├── api/
│   │   ├── player.ts         # Player API calls
│   │   └── meta.ts           # Top players + battle logs
│   ├── models/models.ts      # TypeScript types
│   ├── services/
│   │   ├── metaBuilder.ts    # Build win-rate DB
│   │   └── deckAnalyzer.ts   # Scoring + selection
│   ├── server.ts             # Bun HTTP server
│   ├── constants/
│   ├── index.ts              # CLI test harness (optional)
│   └── package.json
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/       # React components
│   │   ├── api.ts            # Fetch helpers
│   │   ├── main.tsx
│   │   └── index.css
│   ├── vite.config.ts        # Proxy /api → backend
│   └── package.json
├── meta-cache.json           # Meta database (generated)
├── .env                      # API key (not in git)
├── GUIDE.MD                  # This file
└── README.md
```

## Development

### Build for Production
```bash
cd web && bun run build
# Output in web/dist/
```

### Test Player Endpoint
```bash
curl "http://localhost:3000/api/player/%232QGG92L9"
```

### View Server Logs
```bash
tail -f server.log
```

## Notes

- The greedy 4-deck selection is fast but not optimal. For exhaustive combinations, upgrade to an ILP solver.
- Currently uses top 200 players. Increase `limit` in `metaBuilder.ts` for more comprehensive meta (slower builds).
- Card icons can be added by fetching from official Supercell CDN (included in API responses as `iconUrls`).
- No authentication needed for the web UI (client-side only).