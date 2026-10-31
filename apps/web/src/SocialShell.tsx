import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Bell, Compass, Hash, Headphones, Home, LogOut, MessageCircle,
  Plus, Search, Users, Video, Volume2,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import DemoMessageComposer, { DemoAttachmentView, type ComposePayload } from './DemoMessageComposer';
import { DemoChatBubble, messagePreview, type DemoMessage } from './DemoChatBubble';
import { DemoMediaViewer, type PreviewMediaItem } from './DemoChatMedia';

export type SignedInAccount = {
  user: { id: string; name: string; email: string };
  profile: { handle: string; displayName: string; bio: string | null } | null;
};
type Area = 'feed' | 'conversations' | 'communities' | 'profile';

const navigation = [
  { id: 'feed', label: 'Início', icon: Home },
  { id: 'conversations', label: 'Conversas', icon: MessageCircle },
  { id: 'communities', label: 'Comunidades', icon: Users },
] as const;

const demoContacts = [
  { id: 'lia', name: 'Lia', initials: 'LI', topic: 'Uma conversa de exemplo', color: 'bg-sky-600' },
  { id: 'caio', name: 'Caio', initials: 'CA', topic: 'Tudo certo para a partida?', color: 'bg-violet-600' },
] as const;

const exampleMessages: Record<string, DemoMessage[]> = {
  lia: [
    { id: 1, mine: false, text: 'Oi! Vamos testar como as conversas vão funcionar?', time: '10:24' },
    { id: 2, mine: true, text: 'Claro! Gostei da interface mais limpa.', time: '10:25' },
    { id: 3, mine: false, text: 'As mensagens privadas serão sempre entre duas pessoas.', time: '10:26' },
  ],
  caio: [
    { id: 4, mine: false, text: 'Tudo certo para a partida?', time: 'Ontem' },
  ],
};

const demoCommunities = [
  {
    id: 'estudio', name: 'Estúdio', monogram: 'E', className: 'bg-indigo-600',
    description: 'Um espaço de exemplo para projetos e ideias.',
    channels: [
      { id: 'geral', label: 'geral', kind: 'text' },
      { id: 'projetos', label: 'projetos', kind: 'text' },
      { id: 'sala', label: 'Sala de conversa', kind: 'voice' },
    ],
  },
  {
    id: 'arena', name: 'Arena', monogram: 'A', className: 'bg-emerald-700',
    description: 'Uma comunidade de demonstração para jogos.',
    channels: [
      { id: 'boas-vindas', label: 'boas-vindas', kind: 'text' },
      { id: 'partidas', label: 'partidas', kind: 'text' },
      { id: 'voz', label: 'Squad', kind: 'voice' },
    ],
  },
] as const;

function ProfileAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
  return <Avatar className={cn('size-9', className)}><AvatarFallback className="bg-primary/20 font-semibold text-primary">{initials}</AvatarFallback></Avatar>;
}

function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      {children ?? 'Prévia de interface: os dados abaixo são fictícios e não são salvos.'}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Home; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-5 py-14 text-center">
      <div className="mb-4 rounded-2xl border border-border bg-muted p-4"><Icon aria-hidden="true" className="size-7 text-primary" /></div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export default function SocialShell({ account, onLogout }: {
  account: SignedInAccount;
  onLogout: () => Promise<void>;
}) {
  const [area, setArea] = useState<Area>('feed');
  const [search, setSearch] = useState('');
  const [conversationId, setConversationId] = useState<string>('lia');
  const [conversationOpened, setConversationOpened] = useState(false);
  const [conversations, setConversations] = useState<Record<string, DemoMessage[]>>(exampleMessages);
  const [replyTarget, setReplyTarget] = useState<DemoMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DemoMessage | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mediaViewerId, setMediaViewerId] = useState<number | null>(null);
  const [communityId, setCommunityId] = useState<string>('estudio');
  const [channelId, setChannelId] = useState<string>('geral');
  const [channelOpened, setChannelOpened] = useState(false);
  const [channelExamples, setChannelExamples] = useState<Record<string, DemoMessage[]>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const attachmentUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = attachmentUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  const activeCommunity = demoCommunities.find(group => group.id === communityId) ?? demoCommunities[0];
  const activeChannel = activeCommunity.channels.find(ch => ch.id === channelId) ?? activeCommunity.channels[0];
  const activeContact = demoContacts.find(contact => contact.id === conversationId) ?? demoContacts[0];
  const visibleContacts = useMemo(() => demoContacts.filter(contact =>
    contact.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  ), [search]);
  const communityKey = communityId + '/' + channelId;
  const visibleChannelMessages: DemoMessage[] = channelExamples[communityKey] ?? [
    { id: 100, mine: false, text: 'Este canal demonstra como os bate-papos de comunidades serão organizados.', time: 'Exemplo' },
  ];
  const activeMessages = area === 'conversations' ? (conversations[conversationId] ?? []) : visibleChannelMessages;
  const mediaItems: PreviewMediaItem[] = activeMessages.flatMap(message =>
    message.attachment && (message.attachment.kind === 'image' || message.attachment.kind === 'video')
      ? [{ id: message.id, attachment: message.attachment }]
      : []
  );

  function updateDraft(key: string, value: string) {
    setDrafts(previous => ({ ...previous, [key]: value }));
  }

  function reactToDemoMessage(id: number, emoji: string) {
    setConversations(previous => ({
      ...previous,
      [conversationId]: (previous[conversationId] ?? []).map(message =>
        message.id === id && !message.mine
          ? { ...message, myReaction: message.myReaction === emoji ? undefined : emoji }
          : message
      ),
    }));
  }

  function move(next: Area) {
    setArea(next);
    setSearch('');
    setConversationOpened(false);
    setChannelOpened(false);
    setReplyTarget(null);
    setEditingMessage(null);
    setMediaViewerId(null);
  }

  function sendDemoMessage({ text, attachment }: ComposePayload) {
    if (editingMessage) {
      if (!text) return;
      setConversations(previous => ({
        ...previous,
        [conversationId]: (previous[conversationId] ?? []).map(message =>
          message.id === editingMessage.id && message.mine && !message.attachment
            ? { ...message, text, edited: true }
            : message
        ),
      }));
      setEditingMessage(null);
      return;
    }
    if (!text && !attachment) return;
    if (attachment) attachmentUrls.current.add(attachment.url);
    setConversations(previous => ({
      ...previous,
      [conversationId]: [...(previous[conversationId] ?? []), {
        id: Date.now() + Math.random(), mine: true, text, attachment,
        replyTo: replyTarget?.id,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }],
    }));
    setReplyTarget(null);
  }

  function deleteDemoMessage(message: DemoMessage) {
    if (!message.mine) return;
    if (message.attachment) {
      URL.revokeObjectURL(message.attachment.url);
      attachmentUrls.current.delete(message.attachment.url);
    }
    setConversations(previous => ({
      ...previous,
      [conversationId]: (previous[conversationId] ?? []).filter(item => item.id !== message.id),
    }));
    if (mediaViewerId === message.id) setMediaViewerId(null);
    if (replyTarget?.id === message.id) setReplyTarget(null);
    if (editingMessage?.id === message.id) setEditingMessage(null);
  }

  function sendDemoChannel({ text, attachment }: ComposePayload) {
    if (!text && !attachment) return;
    if (attachment) attachmentUrls.current.add(attachment.url);
    setChannelExamples(previous => ({
      ...previous,
      [communityKey]: [...(previous[communityKey] ?? visibleChannelMessages), {
        id: Date.now() + Math.random(), mine: true, text, attachment,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }],
    }));
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError('');
    try { await onLogout(); }
    catch { setLogoutError('Não foi possível sair da conta. Tente novamente.'); setLoggingOut(false); }
  }

  const title = area === 'profile' ? 'Perfil' : navigation.find(item => item.id === area)?.label ?? 'Uorqui';
  const showSubpage = (area === 'conversations' && conversationOpened) || (area === 'communities' && channelOpened);

  return (
    <div className="flex h-[100dvh] min-h-[380px] w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-55 shrink-0 flex-col border-r border-border bg-card/65 md:flex">
        <button className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5 text-left text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring" onClick={() => move('feed')} aria-label="Uorqui — ir para o início">
          uorqui<span className="text-primary">.</span>
        </button>
        <nav className="flex flex-col gap-1 p-3" aria-label="Navegação principal">
          {navigation.map(item => {
            const Icon = item.icon;
            return <Button type="button" key={item.id} variant={area === item.id ? 'secondary' : 'ghost'} onClick={() => move(item.id)} aria-current={area === item.id ? 'page' : undefined} className={cn('h-11 justify-start gap-3 text-sm', area === item.id && 'text-primary')}>
              <Icon aria-hidden="true" className="size-4" />{item.label}
            </Button>;
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-border p-3">
          <button type="button" onClick={() => move('profile')} aria-label="Abrir meu perfil" className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <ProfileAvatar name={account.profile?.displayName ?? account.user.name} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{account.profile?.displayName ?? account.user.name}</span><span className="block truncate text-xs text-muted-foreground">{account.profile ? '@' + account.profile.handle : 'Conta Uorqui'}</span></span>
          </button>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut}>
            {loggingOut ? <Spinner /> : <LogOut aria-hidden="true" className="size-4" />}{loggingOut ? 'Saindo…' : 'Sair'}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 pt-[env(safe-area-inset-top)] sm:px-6 md:h-16 md:pt-0">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => move('feed')} aria-label="Uorqui — voltar ao início" className="shrink-0 text-xl font-bold tracking-tight focus-visible:rounded focus-visible:outline-2 focus-visible:outline-ring md:hidden">uorqui<span className="text-primary">.</span></button>
            <Separator orientation="vertical" className="h-5 md:hidden" />
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden gap-1.5 font-normal sm:inline-flex">Prévia do MVP</Badge>
            <Button variant="ghost" size="icon" aria-label="Notificações indisponíveis" title="Notificações chegam em uma próxima etapa" disabled><Bell className="size-4" /></Button>
            <button type="button" onClick={() => move('profile')} aria-label="Abrir meu perfil" title="Meu perfil" className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <ProfileAvatar name={account.profile?.displayName ?? account.user.name} className="size-8" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <motion.div key={area} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className="h-full">
            {area === 'feed' && (
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24 sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><h2 className="text-2xl font-bold tracking-tight">Seu espaço, suas conexões.</h2><p className="mt-1 text-sm text-muted-foreground">Acompanhe pessoas e comunidades que fazem parte do seu mundo.</p></div>
                    <Badge variant="outline">Em construção</Badge>
                  </div>
                  <Card className="gap-4 border-primary/25 bg-primary/5">
                    <CardHeader className="gap-2">
                      <Badge className="w-fit">Bem-vindo ao Uorqui</Badge>
                      <CardTitle className="text-xl">Tudo começa por aqui.</CardTitle>
                      <CardDescription>O cadastro e seu perfil já estão funcionando. O feed, as publicações e os vídeos estão sendo preparados.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => move('communities')}><Users className="size-4" /> Explorar comunidades</Button>
                      <Button type="button" variant="outline" onClick={() => move('conversations')}><MessageCircle className="size-4" /> Ver conversas</Button>
                    </CardContent>
                  </Card>
                  <EmptyState icon={Compass} title="Seu feed aparecerá aqui" description="Ainda não há publicações reais para mostrar. Quando o backend social estiver pronto, esta área reunirá textos, fotos, carrosséis e vídeos." />
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Video className="size-4" /> O modo Vídeos será uma visualização separada do feed.</div>
                </div>
              </ScrollArea>
            )}

            {area === 'conversations' && (
              <div className="flex h-full min-w-0">
                <section aria-label="Lista de conversas" className={cn('w-full min-w-0 flex-col border-r border-border bg-card/30 md:flex md:w-82 md:shrink-0', conversationOpened ? 'hidden' : 'flex')}>
                  <div className="shrink-0 space-y-3 border-b border-border p-4">
                    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">Conversas</h2><Badge variant="outline">1:1</Badge></div>
                    <div className="relative"><Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Buscar conversas de exemplo" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversas" className="h-11 pl-9 text-base" /></div>
                  </div>
                  <DemoNotice>Conversas de demonstração; não há mensagens reais.</DemoNotice>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="p-2">
                      {visibleContacts.map(contact => (
                        <Button key={contact.id} type="button" variant={contact.id === conversationId && conversationOpened ? 'secondary' : 'ghost'} onClick={() => { setConversationId(contact.id); setConversationOpened(true); setReplyTarget(null); setEditingMessage(null); setMediaViewerId(null); }} className={cn('h-auto w-full justify-start gap-3 rounded-xl px-3 py-3 text-left md:py-4', contact.id === conversationId && 'md:bg-accent/40')}>
                          <Avatar className="size-11"><AvatarFallback className={cn('text-white', contact.color)}>{contact.initials}</AvatarFallback></Avatar>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{contact.name} <span className="font-normal text-muted-foreground">(exemplo)</span></span><span className={cn('mt-0.5 block truncate text-xs font-normal', drafts['dm/' + contact.id]?.trim() ? 'text-primary' : 'text-muted-foreground')}>
                              {drafts['dm/' + contact.id]?.trim() ? 'Rascunho: ' + drafts['dm/' + contact.id].trim() : contact.topic}
                            </span></span>
                        </Button>
                      ))}
                      {visibleContacts.length === 0 && <EmptyState icon={Search} title="Nenhuma conversa encontrada" description="Tente outro nome. Esta lista é apenas uma prévia visual." />}
                    </div>
                  </ScrollArea>
                </section>
                <section aria-label="Conversa demonstrativa" className={cn('min-w-0 flex-1 flex-col', conversationOpened ? 'flex' : 'hidden md:flex')}>
                  <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
                    <Button variant="ghost" size="icon" aria-label="Voltar às conversas" onClick={() => { setConversationOpened(false); setReplyTarget(null); setEditingMessage(null); setMediaViewerId(null); }} className="md:hidden"><ArrowLeft className="size-5" /></Button>
                    <Avatar className="size-9"><AvatarFallback className={cn('text-white',activeContact.color)}>{activeContact.initials}</AvatarFallback></Avatar>
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{activeContact.name} <span className="font-normal text-muted-foreground">· exemplo</span></div><p className="text-xs text-muted-foreground">Conversa individual</p></div>
                  </div>
                  <DemoNotice>As mensagens enviadas aqui ficam apenas nesta prévia, até atualizar a página.</DemoNotice>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex w-full min-w-0 flex-col gap-3 px-4 py-6 sm:px-6 lg:px-8">
                      {(conversations[conversationId] ?? []).map(message => (
                        <DemoChatBubble key={message.id} message={message} quoted={(conversations[conversationId] ?? []).find(item => item.id === message.replyTo)}
                          onReply={() => { setEditingMessage(null); setReplyTarget(message); }}
                          onEdit={() => { if (message.mine && !message.attachment) { setReplyTarget(null); setEditingMessage(message); } }}
                          onDelete={() => deleteDemoMessage(message)}
                          onReact={emoji => reactToDemoMessage(message.id, emoji)}
                          onOpenMedia={message.attachment && (message.attachment.kind === 'image' || message.attachment.kind === 'video') ? () => setMediaViewerId(message.id) : undefined}
                          onLocateReply={id => { document.getElementById('dm-message-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />
                      ))}
                    </div>
                  </ScrollArea>
                  <DemoMessageComposer key={'dm-' + conversationId + '-' + conversationOpened} onSend={sendDemoMessage} ariaLabel="Mensagem de demonstração" placeholder="Digite uma mensagem…"
                    replyPreview={replyTarget ? { author: replyTarget.mine ? 'Você' : activeContact.name, text: messagePreview(replyTarget) } : null}
                    onCancelReply={() => setReplyTarget(null)}
                    editing={editingMessage}
                    onCancelEditing={() => setEditingMessage(null)}
                    draftText={drafts['dm/' + conversationId] ?? ''}
                    onDraftChange={next => updateDraft('dm/' + conversationId, next)} />
                </section>
              </div>
            )}

            {area === 'communities' && (
              <div className="flex h-full min-w-0">
                <div className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-border bg-card/50 py-4" aria-label="Comunidades de demonstração">
                  {demoCommunities.map(group => <Button key={group.id} type="button" size="icon" variant={communityId === group.id ? 'secondary' : 'ghost'} className={cn('size-11 rounded-2xl text-lg font-bold', communityId === group.id && 'ring-2 ring-primary/70')} onClick={() => { setCommunityId(group.id); setChannelId(group.channels[0].id); setChannelOpened(false); setMediaViewerId(null); }} aria-label={'Comunidade ' + group.name} aria-pressed={communityId === group.id}>
                    <span className={cn('flex size-9 items-center justify-center rounded-xl text-white',group.className)}>{group.monogram}</span>
                  </Button>)}
                  <Separator className="w-7" />
                  <Button size="icon" variant="outline" disabled title="Criação de comunidades em desenvolvimento" aria-label="Criar comunidade indisponível" className="size-10 rounded-2xl"><Plus className="size-4" /></Button>
                </div>
                <section aria-label="Lista de canais" className={cn('min-w-0 flex-1 flex-col border-r border-border bg-card/25 md:flex md:w-65 md:shrink-0 md:flex-none', channelOpened ? 'hidden' : 'flex')}>
                  <div className="shrink-0 border-b border-border px-4 py-4">
                    <div className="truncate font-semibold">{activeCommunity.name}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{activeCommunity.description}</p>
                  </div>
                  <DemoNotice>Canais ilustrativos, sem membros reais.</DemoNotice>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-4 p-3">
                      <div><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Canais de texto</p>
                        {activeCommunity.channels.filter(ch => ch.kind === 'text').map(ch => <Button key={ch.id} variant={ch.id === channelId ? 'secondary' : 'ghost'} className="mb-1 h-10 w-full justify-start gap-2" onClick={() => { setChannelId(ch.id); setChannelOpened(true); setMediaViewerId(null); }}><Hash className="size-4 text-muted-foreground" />{ch.label}</Button>)}
                      </div>
                      <div><p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Canais de voz</p>
                        {activeCommunity.channels.filter(ch => ch.kind === 'voice').map(ch => <Button key={ch.id} variant={ch.id === channelId ? 'secondary' : 'ghost'} className="mb-1 h-10 w-full justify-start gap-2" onClick={() => { setChannelId(ch.id); setChannelOpened(true); setMediaViewerId(null); }}><Volume2 className="size-4 text-muted-foreground" />{ch.label}</Button>)}
                      </div>
                    </div>
                  </ScrollArea>
                </section>
                <section aria-label="Conteúdo do canal" className={cn('min-w-0 flex-1 flex-col', channelOpened ? 'flex' : 'hidden md:flex')}>
                  <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
                    <Button size="icon" variant="ghost" aria-label="Voltar aos canais" onClick={() => { setChannelOpened(false); setMediaViewerId(null); }} className="md:hidden"><ArrowLeft className="size-5" /></Button>
                    {activeChannel.kind === 'voice' ? <Volume2 className="size-5 text-muted-foreground" /> : <Hash className="size-5 text-muted-foreground" />}
                    <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{activeChannel.label}</h2><p className="text-xs text-muted-foreground">{activeCommunity.name} · exemplo</p></div>
                  </div>
                  <DemoNotice>Comunidade demonstrativa. Nenhuma conversa é publicada.</DemoNotice>
                  {activeChannel.kind === 'voice' ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                      <div className="px-6 text-center"><Headphones aria-hidden="true" className="mx-auto mb-4 size-11 text-primary" /><h3 className="font-semibold">Sala de voz</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Aqui você poderá conversar por áudio com os membros da comunidade. Conexão de voz ainda não está disponível.</p><Button className="mt-5" disabled>Conectar à voz (em breve)</Button></div>
                    </div>
                  ) : (
                    <>
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="w-full min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
                          <EmptyState icon={Hash} title={'Bem-vindo a #' + activeChannel.label} description="Os canais de texto organizam conversas públicas ou privadas conforme as permissões de cada comunidade." />
                          {visibleChannelMessages.map(message => <div className="flex gap-3" key={message.id}>
                            <ProfileAvatar name={message.mine ? account.user.name : 'Equipe'} className="size-8" />
                            <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{message.mine ? 'Você (prévia)' : 'Equipe Uorqui (exemplo)'} <span className="ml-2 font-normal text-muted-foreground">{message.time}</span></p>{message.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 wrap-break-word">{message.text}</p>}{message.attachment && <DemoAttachmentView attachment={message.attachment} onOpenMedia={message.attachment.kind === 'image' || message.attachment.kind === 'video' ? () => setMediaViewerId(message.id) : undefined} />}</div>
                          </div>)}
                        </div>
                      </ScrollArea>
                      <DemoMessageComposer key={'channel-' + communityKey + '-' + channelOpened} onSend={sendDemoChannel} ariaLabel="Mensagem de canal de exemplo" placeholder={'Mensagem em #' + activeChannel.label + ' (prévia)'}
                        draftText={drafts['channel/' + communityKey] ?? ''}
                        onDraftChange={next => updateDraft('channel/' + communityKey, next)} />
                    </>
                  )}
                </section>
              </div>
            )}

            {area === 'profile' && (
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-2xl space-y-5 p-5 pb-24 sm:p-8">
                  <Card>
                    <CardHeader className="flex flex-row items-center gap-4">
                      <ProfileAvatar name={account.profile?.displayName ?? account.user.name} className="size-16 text-xl" />
                      <div className="min-w-0"><CardTitle className="truncate text-xl">{account.profile?.displayName ?? account.user.name}</CardTitle><CardDescription className="mt-2">{account.profile ? '@' + account.profile.handle : 'Perfil sem nome de usuário'}</CardDescription></div>
                    </CardHeader>
                    <CardContent><p className="text-sm leading-6 text-muted-foreground">{account.profile?.bio || 'Seu espaço para apresentar quem você é. A edição do perfil será adicionada em breve.'}</p></CardContent>
                  </Card>
                  <Card className="gap-4">
                    <CardHeader><CardTitle className="text-base">Sua conta</CardTitle><CardDescription>Informações privadas, visíveis apenas para você nesta página.</CardDescription></CardHeader>
                    <CardContent className="space-y-3"><div className="text-sm"><span className="text-muted-foreground">E-mail</span><p className="mt-1 break-all font-medium">{account.user.email}</p></div><Separator /><div className="flex items-center gap-2"><Badge variant="outline">Conta ativa</Badge><span className="text-xs text-muted-foreground">Edição de perfil em desenvolvimento</span></div></CardContent>
                  </Card>
                  <Button className="w-full md:hidden" variant="outline" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut}>{loggingOut ? <Spinner /> : <LogOut className="size-4" />}{loggingOut ? 'Saindo…' : 'Sair da conta'}</Button>
                </div>
              </ScrollArea>
            )}
          </motion.div>
        </div>

        {logoutError && <div role="alert" className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-foreground">{logoutError}</div>}

        {!showSubpage && <nav className="flex shrink-0 justify-around border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação principal">
          {navigation.map(item => {
            const Icon = item.icon;
            return <Button key={item.id} variant="ghost" onClick={() => move(item.id)} aria-current={area === item.id ? 'page' : undefined} className={cn('flex h-16 min-w-0 flex-1 flex-col gap-1 rounded-none px-1 text-[11px] font-medium', area === item.id ? 'text-primary' : 'text-muted-foreground')}>
              <Icon aria-hidden="true" className="size-5" />{item.label}
            </Button>;
          })}
        </nav>}
      </div>
      <DemoMediaViewer items={mediaItems} selectedId={mediaViewerId} onSelect={setMediaViewerId} onClose={() => setMediaViewerId(null)} />
    </div>
  );
}
