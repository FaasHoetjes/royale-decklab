import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cardPath } from '../lib/cardInfo';

/** Wraps a card's art so clicking it opens the card's page. */
export default function CardLink({ name, title = name, children }: { name: string; title?: string; children: ReactNode }) {
  return (
    <Link to={cardPath(name)} className="card-link" title={title}>
      {children}
    </Link>
  );
}
