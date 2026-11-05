import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A compact, reusable navigation section heading. */
export function UIKitSectionHeading({
  children, action, className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={cn('uorqui-kit-section-heading', className)}>
    <span className="uorqui-kit-section-heading__title">{children}</span>
    {action && <span className="uorqui-kit-section-heading__action">{action}</span>}
  </div>;
}

/** Hides zero counts and caps visible labels at 99+. */
export function UIKitCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <span className={cn('uorqui-kit-count', className)} aria-label={count + ' unread'}>
    {count > 99 ? '99+' : count}
  </span>;
}

/** Subtle outline label for grouped rows, channels and activity. */
export function UIKitChip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('uorqui-kit-chip', className)}>{children}</span>;
}
