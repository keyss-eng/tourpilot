// Shared date-range helpers + presets used across the admin Dashboard / Users /
// Analytics pages so they all speak the same "from/to" language.

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
export const monthStart = () => {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
};

export type Preset = '7d' | '30d' | 'month' | 'custom';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

export function rangeFor(preset: Preset, cFrom: string, cTo: string): { from: string; to: string } {
  if (preset === '7d') return { from: daysAgo(7), to: today() };
  if (preset === '30d') return { from: daysAgo(30), to: today() };
  if (preset === 'month') return { from: monthStart(), to: today() };
  return { from: cFrom, to: cTo };
}
