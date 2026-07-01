import Link from 'next/link';
import { Card } from '@/components/ui/Card';

export function EmptyState({
  icon,
  title,
  subtitle,
  href,
  cta,
}: {
  icon: string;
  title: string;
  subtitle: string;
  href?: string;
  cta?: string;
}) {
  return (
    <Card className="flex flex-col items-center py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-2xl">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{subtitle}</p>
      {href && cta ? (
        <Link
          href={href}
          className="mt-4 rounded-lg border border-primary/50 px-4 py-2 text-sm text-primary hover:bg-primary/10"
        >
          {cta} →
        </Link>
      ) : null}
    </Card>
  );
}
