import { useTween } from '../hooks/useTween';

/** A score that counts to its new value. Kept apart so a count re-renders this number on every frame, not the page around it. */
export default function Tweened({ value, from }: { value: number; from?: number }) {
  return <>{useTween(value, from).toFixed(3)}</>;
}
