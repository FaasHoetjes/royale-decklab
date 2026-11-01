/** "just now", "20 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!(minutes >= 1)) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
