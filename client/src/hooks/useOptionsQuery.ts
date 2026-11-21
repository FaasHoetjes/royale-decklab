import { useState } from 'react';
import { hasActiveOptions, type GeneratorOptions } from '../lib/generatorOptions';

/**
 * The query to fetch the lineup with. Locking or unlocking a deck doesn't change the lineup on screen, so it doesn't
 * fetch: the locks go along with the next request that does (other options, or another `scope` such as a league).
 * Clearing every option does fetch, so Reset always gets the plain lineup even if the one shown was built around a lock.
 */
export function useOptionsQuery(options: GeneratorOptions, query: string, scope = ''): string {
  const [fetched, setFetched] = useState({ options, query, scope });
  let apiQuery = fetched.query;
  if (fetched.options !== options || fetched.scope !== scope) {
    if (fetched.scope !== scope || !onlyLocksChanged(fetched.options, options) || !hasActiveOptions(options)) apiQuery = query;
    setFetched({ options, query: apiQuery, scope });
  }
  return apiQuery;
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function onlyLocksChanged(a: GeneratorOptions, b: GeneratorOptions): boolean {
  return (
    a.decks === b.decks &&
    a.minLevel === b.minLevel &&
    a.boosts === b.boosts &&
    sameIds(a.ban, b.ban) &&
    sameIds(a.require, b.require)
  );
}
