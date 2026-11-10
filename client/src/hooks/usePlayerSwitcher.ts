import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../AppContext';
import { playerCollectionOptions } from '../queries';
import { forgetPlayer, loadRecentPlayers, rememberPlayer } from '../lib/recentPlayers';

/** The active player's name, the other players searched on this device, and ways to switch between them. */
export function usePlayerSwitcher() {
  const { activePlayerTag, setActivePlayerTag } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // The collection is prefetched for every page, so the name comes for free.
  const { data: name } = useQuery({
    ...playerCollectionOptions(activePlayerTag ?? ''),
    enabled: !!activePlayerTag,
    select: (res) => res.player.name,
  });

  const [recent, setRecent] = useState(loadRecentPlayers);
  useEffect(() => {
    if (activePlayerTag && name) setRecent(rememberPlayer(activePlayerTag, name));
  }, [activePlayerTag, name]);

  const generatorPath = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : null;

  return {
    tag: activePlayerTag,
    name: name ?? null,
    others: recent.filter((p) => p.tag !== activePlayerTag),
    switchTo: (tag: string) => {
      // The landing page doesn't follow the active player, so leave it for the new player's generator.
      const onGenerator =
        pathname === '/' || (generatorPath != null && pathname.toUpperCase() === generatorPath.toUpperCase());
      setActivePlayerTag(tag);
      if (onGenerator) navigate(`/${tag.replace('#', '')}`);
    },
    addPlayer: () => {
      setActivePlayerTag(null);
      navigate('/');
    },
    forget: (tag: string) => setRecent(forgetPlayer(tag)),
  };
}

export type PlayerSwitcher = ReturnType<typeof usePlayerSwitcher>;

/** The first letter of a name, for a round avatar. */
export function initialOf(name: string | null): string {
  return (name && Array.from(name.trim())[0]?.toUpperCase()) || '#';
}
