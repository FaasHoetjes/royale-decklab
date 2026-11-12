import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cardPath } from '../lib/cardInfo';

export default function CardLink({ name, title = name, children }: { name: string; title?: string; children: ReactNode }) {
  const path = cardPath(name);
  if (useLocation().pathname === path) {
    return (
      <span className="card-link" title={title} aria-current="page">
        {children}
      </span>
    );
  }
  return (
    <Link to={path} className="card-link" title={title}>
      {children}
    </Link>
  );
}
