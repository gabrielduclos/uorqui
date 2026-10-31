import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ProfilePhotoCropper, type ProfileImageKind } from './ProfilePhotoCropper';
import { clearProfileImageCache, invalidateProfileImage, useCachedProfileImage } from './profileImageCache';
import { ArrowLeft, Camera, Check, ExternalLink, Globe, LockKeyhole, MessageCircle, Search, UserRound, ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { PreferencesControls } from './PreferencesControls';
import { navigateBackFromPublicProfile, navigateToPublicProfile } from './publicProfileNavigation';
import { useUorquiPreferences } from './UorquiPreferences';

export type UserProfileData = {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPublic: boolean;
};
export type PublicProfileData = Omit<UserProfileData, 'isPublic'> & { id: string; createdAt: string };
type SearchResult = Pick<UserProfileData, 'handle' | 'displayName' | 'avatarUrl'>;

export function UserAvatar({ name, image, size = 'md' }: { name: string; image?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || 'U';
  const dimensions = size === 'lg' ? 'size-24 text-2xl sm:size-28' : size === 'sm' ? 'size-10 text-sm' : 'size-12 text-base';
  const [broken, setBroken] = useState(false);
  const cached = useCachedProfileImage(image);
  useEffect(() => setBroken(false), [image, cached]);
  return <span aria-label={name} className={'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-primary/15 font-semibold text-primary ' + dimensions}>
    {cached && !broken ? <img src={cached} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" /> : initials}
  </span>;
}

function Cover({ url, name }: { url?: string | null; name: string }) {
  const cached = useCachedProfileImage(url);
  return <div className="relative h-40 w-full overflow-hidden bg-gradient-to-r from-primary/35 via-primary/15 to-muted sm:h-56">
    {cached && <img src={cached} alt={name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
  </div>;
}

export function UserDirectory({ currentHandle }: { currentHandle?: string }) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setPeople([]); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      void fetch('/api/v1/profiles/search?q=' + encodeURIComponent(term), {
        credentials: 'same-origin', signal: controller.signal,
      }).then(async response => {
        if (!response.ok) throw new Error('SEARCH');
        const json = await response.json() as { results: SearchResult[] };
        setPeople(json.results.filter(person => person.handle !== currentHandle));
      }).catch(err => {
        if (!controller.signal.aborted) { setError(pt ? 'Não foi possível pesquisar usuários.' : 'Could not search for users.'); setPeople([]); }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, currentHandle, pt]);

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" />{pt ? 'Encontrar pessoas' : 'Find people'}</CardTitle>
      <CardDescription>{pt ? 'Pesquise por nome ou @usuário. Apenas perfis públicos aparecem.' : 'Search by name or @username. Only public profiles appear.'}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <Input value={query} onChange={event => setQuery(event.target.value)} maxLength={40}
        placeholder={pt ? 'Nome ou @usuário' : 'Name or @username'} aria-label={pt ? 'Pesquisar pessoas' : 'Search people'} />
      {loading && <p role="status" className="text-sm text-muted-foreground">{pt ? 'Buscando…' : 'Searching…'}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && query.trim().length >= 2 && people.length === 0 && !error && <p className="text-sm text-muted-foreground">{pt ? 'Nenhum perfil público encontrado.' : 'No public profiles found.'}</p>}
      {people.map(person => <a key={person.handle} href={'/@' + person.handle} onClick={event => navigateToPublicProfile(event, person.handle)} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <UserAvatar name={person.displayName} image={person.avatarUrl} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.displayName}</span><span className="block truncate text-xs text-muted-foreground">@{person.handle}</span></span>
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </a>)}
    </CardContent>
  </Card>;
}

export function ProfileEditor({ initial, onSaved }: {
  initial: UserProfileData;
  onSaved: (data: UserProfileData) => void;
}) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [profile, setProfile] = useState<UserProfileData>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ kind: ProfileImageKind; file: File } | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  useEffect(() => setProfile(initial), [initial.handle, initial.displayName, initial.bio, initial.avatarUrl, initial.coverUrl, initial.isPublic]);

  function update<K extends keyof UserProfileData>(key: K, value: UserProfileData[K]) {
    setProfile(prev => ({ ...prev, [key]: value }));
    setNotice(''); setError('');
  }

  function choosePhoto(kind: ProfileImageKind, file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
      setError(pt ? 'Selecione uma imagem de até 15 MB.' : 'Choose an image up to 15 MB.');
      return;
    }
    setSelected({ kind, file }); setError(''); setNotice('');
  }

  async function changePhoto(kind: ProfileImageKind, image: Blob | null) {
    if (mediaBusy || saving) return;
    setMediaBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/media/profile/' + kind, {
        method: image ? 'POST' : 'DELETE', credentials: 'same-origin',
        ...(image ? { headers: { 'Content-Type': image.type }, body: image } : {}),
      });
      const result = await response.json().catch(() => ({})) as { profile?: UserProfileData; url?: string | null };
      if (!response.ok || !result.profile) {
        throw new Error(pt ? 'Falha no armazenamento da imagem. Tente novamente.' : 'Photo storage failed. Please try again.');
      }
      invalidateProfileImage(kind === 'avatar' ? initial.avatarUrl : initial.coverUrl);
      onSaved(result.profile);
      setProfile(prev => ({ ...prev, [kind === 'avatar' ? 'avatarUrl' : 'coverUrl']: result.url ?? null }));
      setSelected(null);
      setNotice(pt ? 'Imagem atualizada com sucesso.' : 'Image updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : pt ? 'Falha no envio.' : 'Upload failed.');
      throw err;
    } finally { setMediaBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/v1/me/profile', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: profile.handle, displayName: profile.displayName.trim(),
          bio: profile.bio?.trim() || null,
          avatarUrl: profile.avatarUrl?.trim() || null,
          coverUrl: profile.coverUrl?.trim() || null,
          isPublic: profile.isPublic,
        }),
      });
      const result = await response.json().catch(() => ({})) as { profile?: UserProfileData; error?: string };
      if (!response.ok || !result.profile) {
        if (response.status === 409) throw new Error(pt ? 'Este @usuário já está sendo utilizado.' : 'That @username is already taken.');
        if (response.status === 401) throw new Error(pt ? 'Sua sessão expirou. Entre novamente.' : 'Your session expired. Sign in again.');
        throw new Error(pt ? 'Não foi possível salvar o perfil. Confira os campos e a conexão.' : 'Could not save your profile. Check the fields and your connection.');
      }
      if (result.profile.isPublic !== initial.isPublic || result.profile.avatarUrl !== initial.avatarUrl || result.profile.coverUrl !== initial.coverUrl) clearProfileImageCache();
      setProfile(result.profile);
      onSaved(result.profile);
      setNotice(pt ? 'Perfil salvo com sucesso.' : 'Profile saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : pt ? 'Erro ao salvar.' : 'Save failed.');
    } finally { setSaving(false); }
  }

  // Always navigate to the last saved handle, not an unsaved edit in the form.
  const url = '/@' + initial.handle;
  return <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-20 sm:p-7">
    <div><h2 className="text-2xl font-bold">{pt ? 'Meu perfil' : 'My profile'}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{pt ? 'Edite seus dados e escolha o que ficará público.' : 'Edit your information and choose what is public.'}</p></div>
    <Card className="gap-0 overflow-hidden p-0">
      <Cover url={profile.coverUrl} name={pt ? 'Imagem de capa' : 'Cover image'} />
      <div className="relative -mt-10 space-y-3 p-5 pt-0">
        <UserAvatar name={profile.displayName} image={profile.avatarUrl} size="lg" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-xl font-bold">{profile.displayName}</h3><p className="text-sm text-muted-foreground">@{profile.handle}</p></div>
          {initial.isPublic
            ? <a href={url} onClick={event => navigateToPublicProfile(event, initial.handle)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent"><ExternalLink className="size-4" />{pt ? 'Ver perfil público' : 'View public profile'}</a>
            : <span className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"><LockKeyhole className="size-4" />{pt ? 'Perfil privado' : 'Private profile'}</span>}
        </div>
      </div>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-lg">{pt ? 'Editar perfil' : 'Edit profile'}</CardTitle>
        <CardDescription>{pt ? 'As alterações são salvas na sua conta.' : 'Changes are saved to your account.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm"><span className="font-medium">{pt ? 'Nome exibido' : 'Display name'}</span><Input required minLength={2} maxLength={120} value={profile.displayName} onChange={e => update('displayName', e.target.value)} /></label>
            <label className="space-y-1.5 text-sm"><span className="font-medium">@{pt ? 'usuário' : 'username'}</span><Input required minLength={3} maxLength={32} pattern="[a-z][a-z0-9_]{2,31}" value={profile.handle} onChange={e => update('handle', e.target.value.toLowerCase())} /></label>
          </div>
          <label className="block space-y-1.5 text-sm"><span className="font-medium">{pt ? 'Biografia' : 'Bio'}</span>
            <textarea value={profile.bio ?? ''} maxLength={500} rows={3} onChange={e => update('bio', e.target.value)} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder={pt ? 'Conte algo sobre você…' : 'Tell people about yourself…'} />
            <span className="block text-right text-xs text-muted-foreground">{(profile.bio ?? '').length}/500</span>
          </label>
          <Separator />
          <div className="flex items-center gap-2"><Camera className="size-4 text-primary" /><h3 className="text-sm font-semibold">{pt ? 'Fotos do perfil' : 'Profile images'}</h3></div>
          <p className="text-xs text-muted-foreground">{pt ? 'Selecione uma foto do dispositivo, ajuste o recorte e salve. O upload é privado e automático.' : 'Choose a photo, adjust the crop, and save. Upload is private and automatic.'}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['avatar', 'cover'] as const).map(kind => <div key={kind} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">{kind === 'avatar' ? pt ? 'Foto de perfil' : 'Profile photo' : pt ? 'Foto de capa' : 'Cover photo'}</p>
              <div className="flex min-h-24 items-center justify-center overflow-hidden rounded-md bg-muted/60">
                {kind === 'avatar' ? <UserAvatar name={profile.displayName} image={profile.avatarUrl} size="lg" /> :
                  <div className="h-24 w-full overflow-hidden"><Cover url={profile.coverUrl} name={pt ? 'Capa atual' : 'Current cover'} /></div>}
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent focus-within:outline-2 focus-within:outline-ring">
                <ImagePlus className="size-4" />{pt ? 'Escolher foto' : 'Choose photo'}
                <input className="sr-only" type="file" accept="image/*" disabled={saving || mediaBusy}
                  onChange={event => { choosePhoto(kind, event.target.files?.[0]); event.target.value = ''; }} />
              </label>
              {(kind === 'avatar' ? profile.avatarUrl : profile.coverUrl) &&
                <button type="button" disabled={saving || mediaBusy} onClick={() => { void changePhoto(kind, null).catch(() => {}); }}
                  className="ml-2 inline-flex min-h-10 items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50">
                  <Trash2 className="size-4" />{pt ? 'Remover' : 'Remove'}
                </button>}
            </div>)}
          </div>
          <Separator />
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-4">
            <span className="flex items-start gap-3">{profile.isPublic ? <Globe className="mt-0.5 size-5 shrink-0 text-primary" /> : <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
              <span><span className="block text-sm font-semibold">{pt ? 'Perfil público' : 'Public profile'}</span><span className="mt-1 block text-xs text-muted-foreground">{pt
                ? 'Quando desativado, seu perfil não aparece nas buscas nem no link público.'
                : 'When disabled, your profile disappears from search results and its public link.'}</span></span></span>
            <input type="checkbox" checked={profile.isPublic} onChange={e => update('isPublic', e.target.checked)} className="size-5 shrink-0 accent-primary" />
          </label>
          {notice && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Check className="size-4" />{notice}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={saving} className="w-full sm:w-auto"><Check className="size-4" />{saving ? pt ? 'Salvando…' : 'Saving…' : pt ? 'Salvar alterações' : 'Save changes'}</Button>
        </form>
      </CardContent>
    </Card>
    <UserDirectory currentHandle={profile.handle} />
    {selected && typeof document !== 'undefined' && createPortal(
      <ProfilePhotoCropper key={selected.kind + selected.file.name + selected.file.size}
        kind={selected.kind} file={selected.file} onCancel={() => { if (!mediaBusy) setSelected(null); }}
        onSave={async blob => changePhoto(selected.kind, blob)} />, document.body)}
  </div>;
}

export function PublicProfilePage({ handle }: { handle: string }) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    void fetch('/api/v1/profiles/' + encodeURIComponent(handle), { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (response.status === 404) { setStatus('missing'); return; }
        if (!response.ok) throw new Error('PROFILE_UNAVAILABLE');
        const body = await response.json() as { profile: PublicProfileData };
        setProfile(body.profile); setStatus('ready');
      }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [handle]);

  return <main className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4">
        <a href="/" onClick={navigateBackFromPublicProfile} className="inline-flex items-center gap-2 rounded-lg text-base font-semibold focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-5" />uorqui<span className="text-primary">.</span></a>
        <PreferencesControls />
      </div>
    </header>
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
      {status === 'loading' && <p role="status" className="py-16 text-center text-sm text-muted-foreground">{pt ? 'Carregando perfil…' : 'Loading profile…'}</p>}
      {status === 'missing' && <div className="flex flex-col items-center gap-3 py-16 text-center"><LockKeyhole className="size-10 text-muted-foreground" /><h1 className="text-xl font-semibold">{pt ? 'Perfil indisponível' : 'Profile unavailable'}</h1><p className="text-sm text-muted-foreground">{pt ? 'Este perfil não existe ou não é público.' : 'This profile does not exist or is not public.'}</p><Button variant="outline" asChild><a href="/" onClick={navigateBackFromPublicProfile}>{pt ? 'Voltar ao Uorqui' : 'Back to Uorqui'}</a></Button></div>}
      {status === 'error' && <div role="alert" className="py-16 text-center text-sm text-destructive">{pt ? 'Não foi possível carregar o perfil.' : 'Could not load profile.'}</div>}
      {status === 'ready' && profile && <Card className="gap-0 overflow-hidden p-0">
        <Cover url={profile.coverUrl} name={pt ? 'Capa do perfil' : 'Profile cover'} />
        <CardContent className="relative -mt-11 space-y-4 p-5 pt-0 sm:p-7 sm:pt-0">
          <UserAvatar name={profile.displayName} image={profile.avatarUrl} size="lg" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h1 className="text-2xl font-bold">{profile.displayName}</h1><p className="mt-1 text-sm text-muted-foreground">@{profile.handle}</p></div>
            <Button disabled title={pt ? 'Mensagens reais serão habilitadas na próxima etapa.' : 'Real messaging is coming next.'}><MessageCircle className="size-4" />{pt ? 'Conversar (em breve)' : 'Message (coming soon)'}</Button>
          </div>
          <Separator />
          <p className="whitespace-pre-wrap text-sm leading-7">{profile.bio || (pt ? 'Este usuário ainda não escreveu uma biografia.' : 'This user has not added a bio yet.')}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><UserRound className="size-4" />{pt ? 'Membro desde ' : 'Member since '}{new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(profile.createdAt))}</p>
        </CardContent>
      </Card>}
      {status === 'ready' && <Card><CardHeader><CardTitle className="text-base">{pt ? 'Publicações' : 'Posts'}</CardTitle><CardDescription>{pt ? 'O feed público estará disponível em uma próxima etapa.' : 'Public posts will be available in a future release.'}</CardDescription></CardHeader></Card>}
    </div>
  </main>;
}
