import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import WarDeckResult from '../components/WarDeckResult';
import { useAllCards, usePlayerCollection, usePlayerWarDecks } from '../queries';
import { ApiError, type SeasonBoosts } from '../api';
import { toBuilderCards } from '../lib/builderCards';
import { withSeasonBoosts } from '../lib/seasonBoosts';
import { deckKey, saveDefaults, toQuery, type GeneratorOptions } from '../lib/generatorOptions';
import { playerLinkOptions } from '../lib/shareLink';
import { track } from '../lib/stats';
import { routeFlag } from '../lib/routeState';
import { useApp } from '../AppContext';
import LoadError from '../components/LoadError';
import { homePath } from '../components/navItems';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import PlayedToday from '../components/warDeck/PlayedToday';
import { useIsMobile } from '../hooks/useIsMobile';
import { useOptionsQuery } from '../hooks/useOptionsQuery';

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { activePlayerTag, setActivePlayerTag } = useApp();
  // A clan member's decks opened from the clan planner: looking at a clanmate doesn't make them your player.
  const fromClan = routeFlag(location.state, 'fromClan');
  const isMobile = useIsMobile();

  const tag = playerId ? `#${playerId}` : null;

  // Options live in the URL (shareable). Each change loads at once: deck count and level are single
  // clicks, and the card picker applies its picks in one go when it closes.
  const [searchParams] = useSearchParams();
  const { shared, options } = useMemo(() => playerLinkOptions(searchParams), [searchParams]);
  const query = toQuery(options);

  const apiQuery = useOptionsQuery(options, query);

  // Write remembered defaults and cleaned-up values back, so the address bar always matches what is shown.
  const showOptions = (next: string) => navigate({ search: next ? `?${next}` : '' }, { replace: true, state: location.state });
  useEffect(() => {
    if (playerId && !shared && searchParams.toString().replace(/%2C/g, ',') !== query) showOptions(query);
  }, [playerId, query, shared]);

  const handleOptionsChange = (next: GeneratorOptions) => {
    saveDefaults(next);
    showOptions(toQuery(next));
  };

  const warDecks = usePlayerWarDecks(tag, apiQuery);
  // If changing options fails (e.g. the rate limit), keep showing this player's last decks instead of leaving the page.
  const lastLoaded = useRef<{ tag: string; data: NonNullable<typeof warDecks.data> } | null>(null);
  if (tag && warDecks.data && !warDecks.isPlaceholderData) lastLoaded.current = { tag, data: warDecks.data };
  const fallback = lastLoaded.current?.tag === tag ? lastLoaded.current.data : null;
  const playerData = warDecks.data ?? fallback;
  const optionsFailed = warDecks.isError && fallback != null;
  // No answer, or Cloudflare's 5xx for a down origin, means the server is down, not that the tag is wrong.
  const unreachable = warDecks.isError && !fallback && !(warDecks.error instanceof ApiError && warDecks.error.status < 500);

  const catalog = useAllCards();
  const collection = usePlayerCollection(playerData && !shared ? tag : null);
  const seasonBoosts = playerData?.seasonBoosts ?? NO_BOOSTS;
  // At the levels the decks are scored at, so the minimum level and its warnings agree with the decks shown.
  const pickerCards = useMemo(() => {
    if (!catalog.data || !collection.data) return [];
    const owned = toBuilderCards(catalog.data, collection.data);
    return options.boosts ? withSeasonBoosts(owned, seasonBoosts) : owned;
  }, [catalog.data, collection.data, options.boosts, seasonBoosts]);

  // Once a tag's decks load successfully, make that player active app-wide (used by the Builder + Best
  // Decks); someone else's shared lineup leaves the reader's own player alone.
  useEffect(() => {
    if (warDecks.isSuccess && tag && !shared && !fromClan) setActivePlayerTag(tag);
  }, [warDecks.isSuccess, tag, shared, fromClan]);

  // A friend opening a shared lineup isn't a lookup of the owner: only a tag of their own counts as one.
  useEffect(() => {
    if (!warDecks.isSuccess || !tag || fromClan) return;
    track({ kind: shared ? 'share_open' : 'lookup', tag });
  }, [warDecks.isSuccess, tag, shared, fromClan]);

  useEffect(() => {
    if (warDecks.isError && playerId && !fallback && !unreachable) {
      if (!shared && !fromClan) setActivePlayerTag(null);
      navigate('/', {
        replace: true,
        state: {
          tagError: shared
            ? "Couldn't load that shared lineup. Try the link again in a moment."
            : "Couldn't load that player. Check your tag or try again.",
          badTag: playerId,
        },
      });
    }
  }, [warDecks.isError, playerId]);

  // Shown in the order they were shared; a deck the player can no longer field was replaced, and goes last.
  const shownDecks = useMemo(() => {
    const decks = playerData?.warDecks.decks ?? [];
    if (!shared) return decks;
    const order = shared.map(deckKey);
    const rank = (ids: number[]) => {
      const i = order.indexOf(deckKey(ids));
      return i < 0 ? order.length : i;
    };
    return [...decks].sort((a, b) => rank(a.cardIds) - rank(b.cardIds));
  }, [playerData, shared]);

  const getMyDecks = () => navigate(homePath(activePlayerTag));

  const handleNewSearch = () => {
    if (!fromClan) setActivePlayerTag(null);
    navigate('/');
  };

  if (unreachable) {
    return (
      <LoadError
        title="Can't reach the server"
        message="Royale DeckLab is unreachable right now. Please try again in a moment."
        onRetry={() => warDecks.refetch()}
        retrying={warDecks.isFetching}
        retryLabel="Retry connection"
        style={{ minHeight: '80dvh' }}
      />
    );
  }

  return playerData ? (
    <WarDeckResult
      playerName={playerData.player.name}
      playerTag={tag!}
      decks={shownDecks}
      alternatives={playerData.warDecks.alternatives}
      onNewSearch={handleNewSearch}
      options={options}
      onOptionsChange={handleOptionsChange}
      cards={pickerCards}
      seasonBoosts={seasonBoosts}
      isUpdating={!optionsFailed && warDecks.isPlaceholderData}
      updateFailed={optionsFailed}
      onRetry={() => warDecks.refetch()}
      shared={shared ? { onGetMine: getMyDecks, decks: shared } : undefined}
      playedToday={
        shared || !tag ? undefined : (
          // Not saved as the remembered defaults: tomorrow starts with four decks again.
          <PlayedToday playerTag={tag} options={options} onPlan={(next) => showOptions(toQuery(next))} isMobile={isMobile} />
        )
      }
    />
  ) : (
    <WarDecksSkeleton isMobile={isMobile} />
  );
}

const NO_BOOSTS: SeasonBoosts = { level: 0, cardIds: [] };
