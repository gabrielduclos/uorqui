import { useEffect, useState } from 'react';
import { Check, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUorquiPreferences } from './UorquiPreferences';

export function ContactToggleButton({ handle }: { handle: string }) {
  const { locale } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function check() {
      const response = await fetch('/api/v1/contacts', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('CONTACTS');
      const data = await response.json() as { contacts: { handle: string }[] };
      if (!controller.signal.aborted) setSaved(data.contacts.some(c => c.handle === handle));
    }
    void check().catch(() => { if (!controller.signal.aborted) setError(pt ? 'Contatos indisponíveis.' : 'Contacts unavailable.'); });
    return () => controller.abort();
  }, [handle, pt]);

  async function toggle() {
    if (saved === null || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(saved ? '/api/v1/contacts/' + encodeURIComponent(handle) : '/api/v1/contacts', {
        method: saved ? 'DELETE' : 'POST', credentials: 'same-origin', cache: 'no-store',
        ...(!saved ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) } : {}),
      });
      if (!response.ok) throw new Error('CONTACT');
      setSaved(!saved);
      window.dispatchEvent(new Event('uorqui:contacts-updated'));
    } catch { setError(pt ? 'Não foi possível alterar o contato.' : 'Could not update contact.'); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-1">
    <Button type="button" size="default" variant="outline" disabled={saved === null || busy || !!error} onClick={() => void toggle()}
      aria-pressed={saved === true}>
      {saved ? <UserMinus className="size-4"/> : saved === null ? <Check className="size-4"/> : <UserPlus className="size-4"/>}
      {saved ? (pt ? 'Remover contato' : 'Remove contact') : (pt ? 'Adicionar contato' : 'Save contact')}
    </Button>
    {error && <span role="alert" className="max-w-40 text-xs text-destructive">{error}</span>}
  </div>;
}
