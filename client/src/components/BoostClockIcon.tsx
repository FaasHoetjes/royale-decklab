/** The season boost marker: a clock with an up-arrow, its hand ticking round in quarter turns (see .boost-clock-hand). */
export default function BoostClockIcon() {
  return (
    <svg viewBox="0 0 24 29" width="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d="M12 .8 21.6 10.2H16.4V11.5H7.6V10.2H2.4Z" fill="#ec5cf0" stroke="#7a1680" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12" cy="19" r="9.2" fill="#ec5cf0" stroke="#7a1680" strokeWidth="1.3" />
      <circle cx="12" cy="19" r="6.6" fill="#f6e9f1" />
      <circle cx="12" cy="14.3" r="0.9" fill="#4a3b48" />
      <circle cx="16.7" cy="19" r="0.9" fill="#4a3b48" />
      <circle cx="12" cy="23.7" r="0.9" fill="#4a3b48" />
      <circle cx="7.3" cy="19" r="0.9" fill="#4a3b48" />
      <g className="boost-clock-hand">
        <line x1="12" y1="19" x2="12" y2="14.8" stroke="#6b6470" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <circle cx="12" cy="19" r="1.1" fill="#4a3b48" />
    </svg>
  );
}
