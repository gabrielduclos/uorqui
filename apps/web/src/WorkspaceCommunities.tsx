import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkspaceCommunity = {
  id: string;
  name: string;
  avatarUrl: string | null;
  myRole: string | null;
};

/** Only already-authorized communities appear in navigation.
 * The channel APIs still enforce membership and channel-level permissions.
 */
export function useWorkspaceCommunities(accountId: string) {
  const [communities, setCommunities] = useState<WorkspaceCommunity[]>([]);
  useEffect(() => {
    let active = true;
    let request = 0;
    setCommunities([]);
    const refresh = async () => {
      const current = ++request;
      try {
        const res = await fetch('/api/v1/communities', {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!res.ok) throw new Error('COMMUNITIES_UNAVAILABLE');
        const json = await res.json() as { communities?: WorkspaceCommunity[] };
        if (!active || current !== request) return;
        setCommunities((json.communities ?? []).filter(item =>
          typeof item.id === 'string' && typeof item.name === 'string' && !!item.myRole
        ));
      } catch {
        // Keep current shortcuts on temporary network failures.
      }
    };
    const realtime = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail;
      if (detail?.kind === 'ready' || detail?.kind === 'membership' ||
          detail?.kind === 'channel') void refresh();
    };
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('uorqui:community-event', realtime);
    window.addEventListener('focus', focus);
    void refresh();
    return () => {
      active = false;
      request++;
      window.removeEventListener('uorqui:community-event', realtime);
      window.removeEventListener('focus', focus);
    };
  }, [accountId]);
  return communities;
}

export function WorkspaceCommunityShortcuts({
  communities, unread, selectedId, active, onOpen, locale,
}: {
  communities: WorkspaceCommunity[];
  unread: Record<string, number>;
  selectedId: string | null;
  active: boolean;
  onOpen: (id: string) => void;
  locale: string;
}) {
  if (!communities.length) {
    return <p className="px-2 py-2 text-xs text-muted-foreground">
      {locale === 'pt-BR' ? 'Nenhuma comunidade ainda' : 'No communities yet'}
    </p>;
  }
  return <div className="space-y-0.5" data-uorqui-workspace-shortcuts>
    {communities.map(item => {
      const isCurrent = active && item.id === selectedId;
      const count = unread[item.id] ?? 0;
      return <button key={item.id} type="button" onClick={() => onOpen(item.id)}
        title={item.name} aria-current={isCurrent ? 'page' : undefined}
        aria-label={item.name + (count ? ' · ' + count : '')}
        className={cn('flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors hover:bg-accent/75 focus-visible:outline-2 focus-visible:outline-ring',
          isCurrent ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground')}>
        {item.avatarUrl
          ? <img src={item.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-5 shrink-0 rounded-[5px] object-cover"/>
          : <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-[5px] border border-border bg-muted text-[10px] font-semibold text-foreground">
            {item.name.charAt(0).toUpperCase() || <UsersRound className="size-3"/>}
          </span>}
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {count > 0 && <span aria-hidden="true" className="grid min-h-4 min-w-4 shrink-0 place-items-center rounded bg-primary/12 px-1 text-[10px] font-semibold text-primary">
          {count > 99 ? '99+' : count}
        </span>}
      </button>;
    })}
  </div>;
}
