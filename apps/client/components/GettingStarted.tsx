import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

interface Step {
  label: string;
  done: boolean;
  href?: string;
  cta?: string;
}

// Onboarding checklist — driven by real signals. Returns null once everything is
// done, so established clients never see it.
export function GettingStarted({
  hasTours,
  hasViews,
}: {
  hasTours: boolean;
  hasViews: boolean;
}) {
  const steps: Step[] = [
    { label: 'Create your account', done: true },
    { label: 'Add the snippet to your site', done: hasTours, href: '/integration', cta: 'Get snippet' },
    { label: 'Get your first tour view', done: hasViews },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="border-primary/30 bg-primary/[0.06]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Finish setting up · {doneCount} of {steps.length} done</h3>
        <span className="text-xs text-primary">{pct}%</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]',
                s.done ? 'bg-success/20 text-success' : 'border border-border text-muted'
              )}
            >
              {s.done ? '✓' : ''}
            </span>
            <span className={s.done ? 'text-muted line-through' : 'text-text'}>{s.label}</span>
            {!s.done && s.href ? (
              <Link href={s.href} className="ml-auto text-xs text-primary hover:underline">
                {s.cta} →
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
