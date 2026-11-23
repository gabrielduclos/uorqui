import type { Copy } from '../../copy'

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />
}

export function MessageSkeleton({ copy }: { copy: Copy }) {
  return <div className="message-placeholder" role="status" aria-label={copy.loading} aria-busy="true">
    {[0, 1, 2].map((item) => <div className="message" key={item}>
      <Skeleton className="skeleton-avatar" />
      <div className="skeleton-body">
        <Skeleton className="skeleton-name" />
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-line skeleton-short" />
      </div>
    </div>)}
  </div>
}
