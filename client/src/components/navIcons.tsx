const ICON_SIZE = 18;

function iconProps() {
  return {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function ZapIcon() {
  return (
    <svg {...iconProps()}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export function CardsIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="5" width="11" height="15" rx="2" />
      <path d="M17 4.5l3.2 1.1a1.5 1.5 0 0 1 .9 1.9l-3.6 10.4" />
    </svg>
  );
}

export function TrendingUpIcon() {
  return (
    <svg {...iconProps()}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function HelpIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

export function GitHubIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function SwitchIcon() {
  return (
    <svg {...iconProps()} width={15} height={15}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...iconProps()} width={16} height={16}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SmallCloseIcon() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
