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

## Build

Single Docker image serves SPA + API (see the `Dockerfile`).

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

## How it works

### The meta (`meta.db`)

`meta.db` is derived data aggregated from the Clash Royale API, not a source of
truth, and it's gitignored. A fresh database starts empty and a background job
fills it from the battle logs of top war players; until the first rebuild,
meta-backed endpoints return empty results but the app runs. If the API key
can't reach the API, the app logs the 403 and keeps serving what's already
stored.

### Patch boundaries

The card stats are split into this patch and the last one at a boundary, which
is set automatically by two things:

- **Balance updates.** Every 30 minutes a watcher reads Supercell's Clash Royale
  blog. Each "Balance Update – October 19th" heading in a balance post counts as
  one update, which also covers sections added to an existing post, even weeks
  later. A new update sets the boundary to the start of its day (or to when it
  was posted, if that was the same day) once that day has come. If the blog
  lists no posts, or a balance post has no such headings (for example after a
  redesign), the watcher logs an error and the boundary is set by hand. The
  same watcher stores each update's card changes for the Patch page, so they
  need no typing in. A card name in the notes that the card catalog doesn't
  know is logged as a warning and left off the page.
- **New cards, Evos and Heroes.** After each crawl, a card version that has
  never been played before sets the boundary to the first battle that used it,
  once it has been out a day and is in as many of the last week's decks as all
  but the least played 5% of the Evos and Heroes already out (about 1.3% of
  decks in November 2026). Until then it is logged after each crawl but not
  counted. New versions don't always arrive with the season: the Mirror Evo
  appeared a week into November 2026, though at about 0.1% of decks it didn't
  count. On the first run, the versions the catalog lists and the battles
  already stored are recorded as known, so they don't count as new.

A boundary less than 4 days after the current one, or before it, is ignored. A
season's Hero (Monday), its balance update (Tuesday) and an event Evo (a few
days later) all arrive before the Thursday war battles, and four days merges
them into one patch. Setting it by hand through the admin endpoint ignores this
rule. Battles from before the boundary aren't deleted, and they count toward
deck win rates and rankings at full weight until they age out of the 30-day
window. In a backtest over Oct-Nov 2026, discounting them made deck win rates
predict the following days worse at every boundary.

### Ladder battles (`ladder.db`)

Every battle log a crawl reads also holds Trophy Road and Ranked battles. Both
players' sides of each are stored in `ladder.db`, next to `meta.db`: the
player's starting trophies on Trophy Road or their league in Ranked, the
result and crowns, the deck (card ids with their version), the card levels and
the tower troop. Sides are keyed by range and battle time, so the stats read
one range's recent battles in key order. A battle read from both players' logs
is stored once, and sides older than 14 days are pruned. Like `meta.db`, it's
derived data and can be deleted; a file in the first layout is emptied on
start. The war crawl stores its ladder sides after each batch of clans.

The war crawl only reaches players above about 9,000 trophies, so an hourly
ladder poll reads players in every 1,000-trophy range from 4,000 up and in
every Ranked league, at most 500 tracked players each:

- Ladder matches players on trophies, so following a player's opponents fills
  their own range. Opponents a poll had no reads left for are kept for the
  next one, and the ranges with the most room are read first. A player who
  drops below 4,000 trophies is dropped.
- The site's visitors start ranges no one is tracked in yet, followed by the
  clanmates of players in ranges with room.
- A poll reads at most 2,000 logs, or 500 while a Crown Series weekend is on,
  clan member lists included, and waits for a war rebuild to finish before it
  starts. 500 players per range keeps the rereads well within that budget,
  and reads left over at the end of a poll go to players due soon.
- A player is read again after 85% of the time their log took to fill, at
  most every 48 hours: the stats need a fair sample, not every battle.

After each poll the log lists the battles stored and the players tracked per
range and league. The stored counts are kept in `ladder_counts` as battles are
added and pruned, so reporting them doesn't read the whole table; they're
counted again only when the range width changes.

Each poll saves its tracked players with their next read (`ladder_players` in
`ladder.db`, `crown_series_players` in `meta.db`), so a restart picks up where
the last poll left off instead of making every player due at once. If
`ladder.db` can't be read, the ladder poll is skipped rather than spending its
reads.

The ladder poll and the Crown Series poll share their scheduling, seeding and
opponent following (`Services/Crawling`); each only decides what group a
player belongs to.

### Ladder decks (`/ladder`)

After each ladder poll, and on start, the decks for every Trophy Road range and
Ranked league are built again from `ladder.db`:

- Each side's result is adjusted for the level gap with its opponent: a side
  counts as winning its result minus what its levels alone would have won, plus
  a half. A deck isn't credited for being played by players with higher levels.
  The level model (`LadderLevels`) borrows the war fit until it's fitted on
  ladder battles.
- A range with few battles of its own leans on the ranges next to it, like the
  Crown Series caps do (`GroupBorrowing`).
- A player gets one deck plus alternatives from their own range, scored against
  the average card level played there. Below 4,000 trophies they get the 4,000
  range's decks; in Ranked, this season's league or else last season's. A range
  without decks yet falls back to the nearest one.

Ranked doesn't cap card levels: its battles show level 16 cards for players
who own them. Alternatives need as many players as the deck picked, so a
deck one player spammed can't outrank it. The page is unlisted until it ships.

The page shows the player's arena, or their Ranked league shield, from
`client/public/arenas/{arena number}.webp` and `client/public/ranked/{league}.webp`.
A missing image shows the arena's name instead.

### Usage stats (`stats.db`)

Anonymous visitor counts live in `stats.db`, next to `meta.db`. Unlike
`meta.db` it can't be rebuilt. Nothing in it identifies anyone: visitors and
player tags are stored only as keyed hashes whose key changes every month and
is deleted once the month ends, and single visits are deleted after 90 days,
leaving only daily and monthly totals.

### Generation workload

Generation and upgrade advice share a CPU scheduler (one to four workers based
on available processors, 32 queued jobs, ten-second deadline). Identical work
shares a task and results are retained for 60 seconds after completion, with
512 entries per calculation cache. Collection changes, generator options and
meta versions produce distinct keys. Saturation returns `503`, `no-store` and
`Retry-After: 2`; the client retries once without showing the meta-reload notice.
