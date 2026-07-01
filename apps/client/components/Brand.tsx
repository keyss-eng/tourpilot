import { cn } from '@/lib/cn';

// aitour.keyss wordmark with a small mark. `size` tweaks the text scale.
export function Brand({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('brand', text)}>
        aitour<span className="dot">.keyss</span>
      </span>
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white',
        className
      )}
    >
      A
    </span>
  );
}
