import { Badge } from '@/components/ui/badge';

/** Shared beta marker displayed beside the Uorqui wordmark on signed-in and login headers. */
export function BetaBadge({ compact = false }: { compact?: boolean }) {
  return (
    <Badge
      variant="outline"
      title="Uorqui Beta · 0.1.0-beta.1"
      aria-label="Uorqui Beta, versão 0.1.0-beta.1"
      className={`shrink-0 rounded-md border-primary/40 bg-primary/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-primary ${compact ? 'text-[9px]' : 'text-[10px]'}`}
    >
      Beta
    </Badge>
  );
}
