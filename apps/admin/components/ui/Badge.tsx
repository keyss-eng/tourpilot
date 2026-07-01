import { cn } from '@/lib/cn';

type Tone = 'soon' | 'success' | 'warning' | 'muted';

const TONES: Record<Tone, string> = {
  soon: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  muted: 'border-border bg-surface-2 text-muted',
};

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs', TONES[tone])}>{children}</span>
  );
}
