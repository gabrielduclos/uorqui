import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell, Home, LogOut, MessageCircle, Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { PreferencesControls } from './PreferencesControls';
import { useUorquiPreferences } from './UorquiPreferences';
import { useVisualViewportFrame } from './useVisualViewportFrame';
import { ProfileEditor, type UserProfileData } from './UserProfiles';
import { useCachedProfileImage } from './profileImageCache';
import LiveDirectChat from './LiveDirectChat';
import LiveCommunities from './LiveCommunities';
import LiveFeed from './LiveFeed';
import { useUnreadDirectMessages } from './useUnreadDirectMessages';

export type SignedInAccount = {
  user: { id: string; name: string; email: string };
  profile: UserProfileData | null;
};
type Area = 'feed' | 'conversations' | 'communities' | 'profile';

const navigation = [
  { id: 'feed', label: 'Início', icon: Home },
  { id: 'conversations', label: 'Conversas', icon: MessageCircle },
  { id: 'communities', label: 'Comunidades', icon: Users },
] as const;

function ProfileAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  const source = useCachedProfileImage(image);
  return <Avatar className={cn('size-9', className)}>{source && <AvatarImage src={source} alt={name} referrerPolicy="no-referrer" className="object-cover" />}<AvatarFallback className="bg-primary/20 font-semibold text-primary">{initials}</AvatarFallback></Avatar>;
}

export default function SocialShell({ account, onLogout, onAccountUpdate, invitedCommunityId }: {
  account: SignedInAccount;
  onLogout: () => Promise<void>;
  onAccountUpdate: (next: SignedInAccount) => void;
  invitedCommunityId?: string | null;
}) {
  const { t, locale } = useUorquiPreferences();
  useVisualViewportFrame();
  const [area, setArea] = useState<Area>(invitedCommunityId?'communities':'feed');
  const [feedTyping,setFeedTyping]=useState(false);
  useEffect(()=>{if(invitedCommunityId)setArea('communities');},[invitedCommunityId]);
  const unreadMessageCount = useUnreadDirectMessages();
  const unreadLabel = unreadMessageCount > 99 ? '99+' : String(unreadMessageCount);
  const [requestedChatHandle, setRequestedChatHandle] = useState<string | null>(null);
  const [conversationOpened, setConversationOpened] = useState(false);
  const [channelOpened, setChannelOpened] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const listener = (event: Event) => {
      const handle = (event as CustomEvent<string>).detail;
      if (typeof handle !== 'string') return;
      setRequestedChatHandle(handle);
      setArea('conversations');
    };
    window.addEventListener('uorqui:open-dm', listener);
    return () => window.removeEventListener('uorqui:open-dm', listener);
  }, []);

  function move(next: Area) {
    setFeedTyping(false);
    setArea(next);
    setConversationOpened(false);
    setChannelOpened(false);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try { await onLogout(); }
    catch { setLogoutError(t("Não foi possível sair da conta. Tente novamente.")); setLoggingOut(false); }
  }

  const title = area === 'profile' ? t('Perfil') : t(navigation.find(item => item.id === area)?.label ?? 'Uorqui');
  const showSubpage = (area === 'conversations' && conversationOpened) || (area === 'communities' && channelOpened);

  return (
    <div data-uorqui-app-shell className="fixed inset-x-0 top-[var(--uorqui-app-top,0px)] flex h-[var(--uorqui-app-height,100dvh)] min-h-0 w-full overflow-hidden overscroll-none bg-background text-foreground">
      <aside className="hidden h-full min-h-0 w-55 shrink-0 flex-col overflow-hidden border-r border-border bg-card/65 md:flex">
        <button className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5 text-left text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring" onClick={() => move('feed')} aria-label={t('Uorqui — ir para o início')}>
          uorqui<span className="text-primary">.</span>
        </button>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3" aria-label={t("Navegação principal")}>
          {navigation.map(item => {
            const Icon = item.icon;
            return <Button type="button" key={item.id} variant={area === item.id ? 'secondary' : 'ghost'} onClick={() => move(item.id)} aria-current={area === item.id ? 'page' : undefined} className={cn('h-11 justify-start gap-3 text-sm', area === item.id && 'text-primary')}
              aria-label={item.id === 'conversations' && unreadMessageCount ? t(item.label) + ': ' + unreadMessageCount + (locale === 'pt-BR' ? ' mensagens não lidas' : ' unread messages') : t(item.label)}>
              <Icon aria-hidden="true" className="size-4" />{t(item.label)}
              {item.id === 'conversations' && unreadMessageCount > 0 && <span aria-hidden="true"
                className="ml-auto grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unreadLabel}</span>}
            </Button>;
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-border p-3">
          <button type="button" onClick={() => move('profile')} aria-label={t('Abrir meu perfil')} className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <ProfileAvatar name={account.profile?.displayName ?? account.user.name} image={account.profile?.avatarUrl} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{account.profile?.displayName ?? account.user.name}</span><span className="block truncate text-xs text-muted-foreground">{account.profile ? '@' + account.profile.handle : t('Conta Uorqui')}</span></span>
          </button>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut}>
            {loggingOut ? <Spinner /> : <LogOut aria-hidden="true" className="size-4" />}{loggingOut ? t("Saindo…") : t('Sair')}
          </Button>
        </div>
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header data-uorqui-main-header className="relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] min-h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 md:h-16 md:min-h-16 md:pt-0">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => move('feed')} aria-label={t('Uorqui — voltar ao início')} className="shrink-0 text-xl font-bold tracking-tight focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring md:hidden">uorqui<span className="text-primary">.</span></button>
            <Separator orientation="vertical" className="h-5 md:hidden" />
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
             <Badge variant="secondary" className="hidden gap-1.5 font-normal xl:inline-flex">{t('Prévia do MVP')}</Badge>
             <PreferencesControls />
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={t("Notificações indisponíveis")} title={t("Notificações chegam em uma próxima etapa")} disabled><Bell className="size-4" /></Button>
            <button type="button" onClick={() => move('profile')} aria-label={t('Abrir meu perfil')} title={t("Meu perfil")} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <ProfileAvatar name={account.profile?.displayName ?? account.user.name} image={account.profile?.avatarUrl} className="size-8" />
            </button>
          </div>
        </header>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0 overflow-hidden">
            {/* Feed remains mounted so changing tabs never resets list, drafts, or scroll position. */}
            <div hidden={area!=='feed'} className="h-full min-h-0">
              <LiveFeed key={account.user.id} userId={account.user.id} active={area==='feed'}
                ownName={account.profile?.displayName??account.user.name}
                ownAvatar={account.profile?.avatarUrl??null}
                onCommentFocusChange={setFeedTyping}/>
            </div>
            {area!=='feed'&&<motion.div key={area} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}
              transition={{duration:0.16}} className="h-full min-h-0 overflow-hidden">
            {area === 'conversations' && (
              <LiveDirectChat myId={account.user.id} initialHandle={requestedChatHandle}
                onMobileOpenChange={setConversationOpened}
                onStarted={() => setRequestedChatHandle(null)} />
            )}

            {area === 'communities' && <LiveCommunities myId={account.user.id} onMobileOpenChange={setChannelOpened} initialCommunityId={invitedCommunityId} />}

            {area === 'profile' && account.profile && (
              <ScrollArea className="h-full">
                <ProfileEditor initial={account.profile} onSaved={profile => onAccountUpdate({ ...account, profile })} />
              </ScrollArea>
            )}
            </motion.div>}
          </div>
        </div>

        {logoutError && <div role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground">{logoutError}</div>}

        {!showSubpage && !feedTyping && <nav className="flex shrink-0 justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t("Navegação principal")}>
          {navigation.map(item => {
            const Icon = item.icon;
            return <Button key={item.id} variant="ghost" onClick={() => move(item.id)} aria-current={area === item.id ? 'page' : undefined} className={cn('flex h-16 min-w-0 flex-1 flex-col gap-1 rounded-none px-1 text-[11px] font-medium', area === item.id ? 'text-primary' : 'text-muted-foreground')}
              aria-label={item.id === 'conversations' && unreadMessageCount ? t(item.label) + ': ' + unreadMessageCount + (locale === 'pt-BR' ? ' mensagens não lidas' : ' unread messages') : t(item.label)}>
              <span className="relative inline-flex">
                <Icon aria-hidden="true" className="size-5" />
                {item.id === 'conversations' && unreadMessageCount > 0 && <span aria-hidden="true"
                  className="absolute -right-3 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-white">{unreadLabel}</span>}
              </span>{t(item.label)}
            </Button>;
          })}
        </nav>}
      </div>
    </div>
  );
}
