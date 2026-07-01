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
        'rounded-lg bg-gradient-to-b from-primary to-primary-dark px-4 py-2.5 text-sm font-medium text-white shadow-glow',
        'transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:shadow-none',
        className
      )}
    />
  );
}
