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
you actually own**, ranked by how they perform in the live Clan War meta. Each
deck comes with alternatives so you can swap cards while keeping the set legal.

The meta itself isn't guessed. It's aggregated from the battle logs of top war
players and refreshed continuously, so recommendations track what's winning
right now.

## Other tools

- **War Deck Builder**: hand-build four war decks and see them scored against the live meta in real time, with your own cards or, without a player tag, a fully maxed collection.
- **Best War Decks**: browse the top-performing sets of four war decks in the current meta.
- **Upgrade Advisor**: ranks which card upgrades (including Evolutions and Heroes) strengthen your current war lineup, or unlock a better one.
- **Cards**: win rate, play rate and patch-to-patch change for every card in Clan War battles, with a page per card showing its best war decks.
- **Clan War Planner**: look up a clan's river race and members' war participation, remind members who still have decks to play, and set up Discord reminders before each war day ends.
- **FAQ**: how the scores are calculated and how each tool works.

## Tech

- **`client/`**: React 19 + Vite SPA (TanStack Query for server state), built and tested with bun.
- **`src/`**: ASP.NET Core (.NET 10) API. Serves the built SPA and exposes `/api/*`. Data lives in SQLite: a background job aggregates meta win rates into `meta.db`, Discord reminders are stored in `reminders.db`, and anonymous visitor stats in `stats.db`.

See [GUIDE.MD](GUIDE.MD) for how to run it locally, and [DOCKER.md](DOCKER.md) for deployment.
