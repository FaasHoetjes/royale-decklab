# Royale DeckLab

A Clash Royale companion that builds your **best war decks** for you.

**Live at [royaledecklab.com](https://royaledecklab.com)**. Enter your player
tag and go.

## War Deck Generator

Clan Wars ask you to bring **4 different decks**, and no card can repeat across
them. Doing that well by hand is fiddly: you have to juggle the current meta,
your own card levels, and the no-overlap rule all at once.

The **War Deck Generator** does it in one step. Enter your player tag and it
returns the 4 strongest non-overlapping decks it can assemble from **the cards
you actually own**, ranked by how they perform in the live top-ladder meta. Each
deck comes with alternatives so you can swap cards while keeping the set legal.

The meta itself isn't guessed. It's aggregated from the battle logs of top war
players and refreshed continuously, so recommendations track what's winning
right now.

## Other tools

- **War Deck Builder**: hand-build a deck and see it scored against the live meta in real time.
- **Best War Decks**: browse the top-performing decks in the current meta.
- **Upgrade Advisor**: ranks which card upgrades (including Evolutions and Heroes) strengthen your current war lineup, or unlock a better one.

## Tech

- **`client/`**: React 18 + Vite SPA (TanStack Query for server state).
- **`src/`**: ASP.NET Core (.NET 10) API. Serves the built SPA and exposes `/api/*`; a background job aggregates meta win-rates into SQLite (`meta.db`).

See [GUIDE.MD](GUIDE.MD) for how to run it locally, and [DOCKER.md](DOCKER.md) for deployment.
