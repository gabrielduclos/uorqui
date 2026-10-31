import { useCallback, useEffect, useState } from 'react';
import { Check, MessageCircle, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { UserAvatar } from './UserProfiles';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { useUorquiPreferences } from './UorquiPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Contact = { handle: string; displayName: string; avatarUrl: string | null; addedAt?: string };
type Person = Pick<Contact, 'handle' | 'displayName' | 'avatarUrl'>;

async function contactRequest(path: string, options?: RequestInit) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (!response.ok) throw new Error('HTTP_' + response.status);
  return response;
}

export function SavedContacts({ onMessage, busy }: { onMessage: (handle: string) => Promise<void>; busy?: boolean }) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [matches, setMatches] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const response = await contactRequest('/api/v1/contacts');
    const payload = await response.json() as { contacts: Contact[] };
    setContacts(payload.contacts);
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void refresh().catch(() => { if (active) {
      setLoading(false);
      setError(pt ? 'Não foi possível carregar seus contatos.' : 'Could not load contacts.');
    } });
    const updated = () => void refresh().catch(() => {});
    window.addEventListener('uorqui:contacts-updated', updated);
    return () => { active = false; window.removeEventListener('uorqui:contacts-updated', updated); };
  }, [refresh, pt]);

  useEffect(() => {
    if (!adding || query.trim().length < 2) { setMatches([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void contactRequest('/api/v1/dm/people?q=' + encodeURIComponent(query.trim()), { signal: controller.signal })
        .then(r => r.json() as Promise<{ people: Person[] }>)
        .then(data => { if (!controller.signal.aborted) setMatches(data.people); })
        .catch(() => { if (!controller.signal.aborted) setError(pt ? 'Falha ao buscar pessoas.' : 'Could not search people.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, adding, pt]);

  const saved = new Set(contacts.map(person => person.handle));
  const filtered = contacts.filter(person =>
    (person.displayName + ' ' + person.handle).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));

  async function change(handle: string, remove: boolean) {
    if (pending) return;
    setPending(handle);
    setError('');
    try {
      await contactRequest(remove ? '/api/v1/contacts/' + encodeURIComponent(handle) : '/api/v1/contacts', remove
        ? { method: 'DELETE' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
      await refresh();
      window.dispatchEvent(new Event('uorqui:contacts-updated'));
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'HTTP_409'
        ? (pt ? 'Limite de 500 contatos alcançado.' : '500-contact limit reached.')
        : (pt ? 'Não foi possível atualizar este contato.' : 'Could not update this contact.'));
    } finally { setPending(null); }
  }

  return <div className="space-y-3 px-1 pb-4">
    <div className="flex items-center justify-between gap-2 px-2">
      <div>
        <h3 className="text-sm font-semibold">{adding ? (pt ? 'Adicionar contato' : 'Add contact') : (pt ? 'Meus contatos' : 'My contacts')}</h3>
        <p className="text-xs text-muted-foreground">{pt ? 'Salvos somente na sua conta' : 'Private to your account'}</p>
      </div>
      <Button size="sm" variant={adding ? 'outline' : 'secondary'} onClick={() => { setAdding(value => !value); setQuery(''); setMatches([]); setError(''); }}>
        {adding ? <X className="size-4" /> : <UserPlus className="size-4" />}
        {adding ? (pt ? 'Fechar' : 'Close') : (pt ? 'Adicionar' : 'Add')}
      </Button>
    </div>
    <div className="relative px-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
      <Input value={query} onChange={event => { setQuery(event.target.value); setError(''); }} maxLength={40}
        aria-label={adding ? (pt ? 'Buscar usuários públicos' : 'Find public users') : (pt ? 'Filtrar contatos' : 'Filter contacts')}
        placeholder={adding ? (pt ? 'Nome ou @usuário' : 'Name or @username') : (pt ? 'Pesquisar contatos' : 'Search contacts')}
        className="h-11 rounded-xl bg-background pl-9 text-base"/>
    </div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">
      {error} <button type="button" className="ml-2 underline" onClick={() => void refresh().catch(() => {})}>{pt ? 'Tentar novamente' : 'Retry'}</button>
    </div>}
    {loading && <div role="status" className="space-y-3 px-2 py-4" aria-label={pt ? 'Carregando contatos' : 'Loading contacts'}>
      {[0,1,2].map(key => <div key={key} className="flex animate-pulse items-center gap-3"><div className="size-10 rounded-full bg-muted"/><div className="h-4 flex-1 rounded bg-muted"/></div>)}
    </div>}
    {adding ? <>
      {searching && <p role="status" className="px-3 text-xs text-muted-foreground">{pt ? 'Buscando pessoas…' : 'Searching people…'}</p>}
      {!searching && query.trim().length >= 2 && matches.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{pt ? 'Nenhuma pessoa encontrada.' : 'No people found.'}</p>}
      {!query.trim() && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{pt ? 'Busque pessoas pelo nome ou @usuário para adicionar.' : 'Find people by name or @username to save.'}</p>}
      {matches.map(person => <div key={person.handle} className="flex min-h-16 items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent">
        <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm"/>
        <a href={'/@' + person.handle} onClick={event => navigateToPublicProfile(event,person.handle)}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <span className="block truncate text-sm font-semibold">{person.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">@{person.handle}</span>
        </a>
        <Button size="sm" variant="outline" disabled={!!pending || saved.has(person.handle)}
          onClick={() => void change(person.handle,false)}
          aria-label={pt ? 'Adicionar ' + person.displayName : 'Add ' + person.displayName}>
          {saved.has(person.handle) ? <Check className="size-4"/> : <UserPlus className="size-4"/>}
          {saved.has(person.handle) ? (pt ? 'Salvo' : 'Saved') : (pt ? 'Salvar' : 'Save')}
        </Button>
      </div>)}
    </> : <>
      {!loading && filtered.length === 0 && <div className="px-4 py-12 text-center">
        <Users className="mx-auto size-9 text-primary"/>
        <h4 className="mt-3 text-sm font-semibold">{query ? (pt ? 'Nenhum contato encontrado' : 'No matching contacts') : (pt ? 'Sua lista está vazia' : 'Your contact list is empty')}</h4>
        <p className="mt-2 text-xs text-muted-foreground">{pt ? 'Adicione pessoas sem precisar iniciar uma conversa.' : 'Save people without starting a conversation.'}</p>
      </div>}
      {filtered.map(contact => <div key={contact.handle} className="flex min-h-[70px] items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent/70">
        <UserAvatar name={contact.displayName} image={contact.avatarUrl} size="sm"/>
        <a href={'/@' + contact.handle} onClick={event => navigateToPublicProfile(event,contact.handle)}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <span className="block truncate text-sm font-semibold">{contact.displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">@{contact.handle}</span>
        </a>
        <button type="button" disabled={busy} onClick={() => void onMessage(contact.handle)}
          aria-label={pt ? 'Conversar com ' + contact.displayName : 'Message ' + contact.displayName}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-primary hover:bg-secondary disabled:opacity-50">
          <MessageCircle className="size-4"/>
        </button>
        <button type="button" disabled={!!pending} onClick={() => void change(contact.handle,true)}
          aria-label={pt ? 'Remover ' + contact.displayName + ' dos contatos' : 'Remove ' + contact.displayName + ' from contacts'}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
          <Trash2 className="size-4"/>
        </button>
      </div>)}
    </>}
  </div>;
}
