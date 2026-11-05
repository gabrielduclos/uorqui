import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCachedProfileImage } from './profileImageCache';

/** Single object URL reused with the main rail and community directory. */
function CommunityShortcutAvatar({url,name}:{url:string|null;name:string}){
  const cached=useCachedProfileImage(url);
  return cached?<img src={cached} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
    className="size-5 shrink-0 rounded-full object-cover"/>:
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-border bg-secondary text-[10px] font-semibold text-foreground">
      {name.trim().charAt(0).toUpperCase()||<UsersRound className="size-3"/>}
    </span>;
}

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

type WorkspaceChannel = {
  id: string;
  name: string;
  kind: 'text' | 'voice' | 'meeting';
  hasPassword?: boolean;
  accessMode?: 'open' | 'restricted';
};

export function WorkspaceCommunityShortcuts({
  communities, unread, channelUnread, selectedId, selectedChannelId, active, onOpen, onOpenChannel, locale,
}: {
  communities: WorkspaceCommunity[];
  unread: Record<string, number>;
  channelUnread: Record<string, number>;
  selectedId: string | null;
  selectedChannelId: string | null;
  active: boolean;
  onOpen: (id: string) => void;
  onOpenChannel: (communityId: string, channelId: string) => void;
  locale: string;
}) {
  const [channels, setChannels] = useState<WorkspaceChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const currentId = active ? selectedId : null;
  useEffect(() => {
    if (!currentId || !communities.some(item => item.id === currentId)) {
      setChannels([]); setLoading(false); return;
    }
    let mounted = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const response = await fetch('/api/v1/communities/' + encodeURIComponent(currentId), {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (!response.ok) throw new Error('CHANNELS_UNAVAILABLE');
        const data = await response.json() as { channels?: WorkspaceChannel[] };
        if (mounted) setChannels(Array.isArray(data.channels) ? data.channels : []);
      } catch {
        if (mounted) setChannels([]);
      } finally {
        inFlight = false;
        if (mounted) setLoading(false);
      }
    };
    const event = (raw: Event) => {
      const detail = (raw as CustomEvent<{ kind?: string; communityId?: string }>).detail;
      if (detail?.kind === 'channel' && detail.communityId === currentId) void load();
    };
    window.addEventListener('uorqui:community-event', event);
    void load();
    return () => { mounted = false; window.removeEventListener('uorqui:community-event', event); };
  }, [currentId, communities.map(item => item.id).join('|')]);

  if (!communities.length) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">
      {locale === 'pt-BR' ? 'Nenhuma comunidade ainda' : 'No communities yet'}
    </p>;
  }
  return <div className="space-y-0.5" data-uorqui-workspace-shortcuts>
    {communities.map(item => {
      const isCurrent = active && item.id === selectedId;
      const count = unread[item.id] ?? 0;
      return <div key={item.id}>
        <button type="button" onClick={() => onOpen(item.id)}
          title={item.name} aria-expanded={isCurrent}
          aria-label={item.name + (count ? ' · ' + count : '')}
          className={cn('group flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-accent/75 focus-visible:outline-2 focus-visible:outline-ring',
            isCurrent ? 'font-semibold text-foreground' : 'text-foreground/85')}>
          <CommunityShortcutAvatar url={item.avatarUrl} name={item.name}/>
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {count > 0 && <span aria-hidden="true" className="grid min-h-4 min-w-4 shrink-0 place-items-center rounded bg-muted px-1 text-[10px] font-semibold text-foreground">
            {count > 99 ? '99+' : count}
          </span>}
          <span aria-hidden="true" className={cn('text-xs text-muted-foreground transition-transform',isCurrent?'rotate-90':'')}>›</span>
        </button>
        {isCurrent && <div className="ml-4 border-l border-border/80 py-0.5 pl-2">
          {loading && !channels.length && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            {locale === 'pt-BR' ? 'Carregando canais…' : 'Loading channels…'}
          </p>}
          {channels.map(channel => {
            const selected = selectedChannelId === channel.id;
            const amount = channelUnread[channel.id] ?? 0;
            const symbol = channel.kind === 'text' ? '#' : channel.kind === 'voice' ? '◉' : '▣';
            return <button type="button" key={channel.id}
              onClick={() => onOpenChannel(item.id, channel.id)}
              title={channel.name} aria-current={selected ? 'page' : undefined}
              className={cn('flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[12px] transition-colors hover:bg-accent/75 focus-visible:outline-2 focus-visible:outline-ring',
                selected ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground')}>
              <span aria-hidden="true" className="w-3 shrink-0 text-center text-[12px]">{symbol}</span>
              <span className="min-w-0 flex-1 truncate">{channel.name}</span>
              {amount > 0 && <span aria-hidden="true" className="grid min-h-4 min-w-4 shrink-0 place-items-center rounded bg-secondary px-1 text-[10px] font-semibold text-foreground">{amount > 99 ? '99+' : amount}</span>}
            </button>;
          })}
          {!loading && channels.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            {locale === 'pt-BR' ? 'Nenhum canal disponível' : 'No channels available'}
          </p>}
        </div>}
      </div>;
    })}
  </div>;
}
