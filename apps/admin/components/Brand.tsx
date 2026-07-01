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
        'grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-dark text-white shadow-glow',
        className
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l2.4 5.1L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.6-1.2L12 3z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
