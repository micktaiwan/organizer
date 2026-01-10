export function formatMessageTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (diffHours < 24) {
    return time;
  } else if (diffHours < 48) {
    return `yesterday ${time}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffWeeks < 8) {
    return diffWeeks === 1 ? "one week ago" : `${diffWeeks} weeks ago`;
  } else {
    return diffMonths === 1 ? "one month ago" : `${diffMonths} months ago`;
  }
}
