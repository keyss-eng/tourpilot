'use client';

import { cn } from '@/lib/cn';
import { PRESETS, today, type Preset } from '@/lib/range';

// The preset chips + custom date inputs shared by every admin analytics page.
export function RangePresets({
  preset,
  setPreset,
  cFrom,
  setCFrom,
  cTo,
  setCTo,
}: {
  preset: Preset;
  setPreset: (p: Preset) => void;
  cFrom: string;
  setCFrom: (v: string) => void;
  cTo: string;
  setCTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              preset === p.id ? 'bg-primary/15 text-text' : 'text-muted hover:text-text'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="flex items-center gap-1 text-xs">
          <input type="date" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none focus:border-primary" />
          <span className="text-muted">→</span>
          <input type="date" value={cTo} max={today()} onChange={(e) => setCTo(e.target.value)}
            className="rounded-lg border border-border bg-bg px-2 py-1.5 outline-none focus:border-primary" />
        </div>
      ) : null}
    </div>
  );
}
