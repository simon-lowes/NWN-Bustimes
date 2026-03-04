export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  if (!hours || !minutes) return time24;
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}
