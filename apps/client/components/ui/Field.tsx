import { cn } from '@/lib/cn';

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      <input
        {...props}
        className={cn(
          'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none transition-colors',
          'placeholder:text-muted/50 focus:border-primary focus:ring-2 focus:ring-primary/30',
          props.className
        )}
      />
    </label>
  );
}

export function Button({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white',
        'transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50',
        className
      )}
    />
  );
}
