import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Only the current page's content displays placeholders.
 * The workspace header, navigation, existing channels and voice sessions
 * remain mounted and responsive while data is fetched.
 */
export function WorkspaceContentLoading({
  label, rows = 4, className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return <div role="status" aria-live="polite" aria-label={label}
    data-uorqui-content-loading
    className={cn('uorqui-kit-content-loading w-full min-w-0 space-y-3',className)}>
    {Array.from({length: rows}, (_,i) =>
      <div key={i} aria-hidden="true" className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
        <Skeleton className="size-8 shrink-0 rounded-lg"/>
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className={cn('h-3',i%3===0?'w-2/3':i%3===1?'w-1/2':'w-3/5')}/>
          <Skeleton className={cn('h-2.5',i%2===0?'w-4/5':'w-2/5')}/>
        </div>
      </div>)}
  </div>;
}
