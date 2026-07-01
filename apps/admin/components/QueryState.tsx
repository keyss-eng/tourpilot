import type { UseQueryResult } from '@tanstack/react-query';

// Renders loading / error states uniformly; calls children with the data once
// it's available.
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/70 bg-surface" />
        ))}
      </div>
    );
  }
  if (query.isError)
    return <p className="text-sm text-danger">{(query.error as Error)?.message ?? 'Failed to load'}</p>;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}
