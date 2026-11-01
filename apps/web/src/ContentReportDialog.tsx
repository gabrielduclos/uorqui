import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ContentReportTarget = { targetKind: 'post' | 'direct_message' | 'community_message'; targetId: string };
const reasons = [
  ['spam', 'Spam ou propaganda', 'Spam or advertising'],
  ['harassment', 'Assédio ou intimidação', 'Harassment or bullying'],
  ['hate', 'Discurso de ódio', 'Hate speech'],
  ['sexual', 'Conteúdo sexual inadequado', 'Inappropriate sexual content'],
  ['violence', 'Violência ou ameaças', 'Violence or threats'],
  ['scam', 'Golpe ou fraude', 'Scam or fraud'],
  ['privacy', 'Exposição de dados pessoais', 'Exposure of private information'],
  ['other', 'Outro motivo', 'Other reason'],
] as const;

export function ContentReportDialog({ target, locale, onClose }: {
  target: ContentReportTarget | null; locale: string; onClose: () => void;
}) {
  const pt = locale === 'pt-BR';
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setReason(''); setDetails(''); setError(''); setComplete(false); setBusy(false);
  }, [target?.targetId, target?.targetKind]);
  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, busy, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !reason || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/reports', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, reason, details: details.trim() }),
      });
      if (response.status === 201) { setComplete(true); return; }
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (data?.error === 'ALREADY_REPORTED') setError(pt ? 'Você já denunciou esse conteúdo.' : 'You have already reported this content.');
      else if (data?.error === 'REPORT_LIMIT_REACHED') setError(pt ? 'Limite de denúncias atingido. Tente novamente amanhã.' : 'Report limit reached. Try again tomorrow.');
      else if (response.status === 404) setError(pt ? 'Este conteúdo não está mais disponível.' : 'This content is no longer available.');
      else setError(pt ? 'Não foi possível enviar a denúncia. Tente novamente.' : 'Could not send report. Try again.');
    } catch {
      setError(pt ? 'Não foi possível conectar. Tente novamente.' : 'Connection failed. Try again.');
    } finally { setBusy(false); }
  }
  if (!target || typeof document === 'undefined') return null;
  const label = target.targetKind === 'post' ? (pt ? 'publicação' : 'post') : (pt ? 'mensagem' : 'message');
  return createPortal(<div role="dialog" aria-modal="true" aria-label={pt ? 'Denunciar conteúdo' : 'Report content'}
    className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 px-3 py-6"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Flag className="size-5 text-destructive"/>
          {pt ? 'Denunciar ' + label : 'Report ' + label}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label={pt ? 'Fechar' : 'Close'}
          className="grid size-10 place-items-center rounded-lg hover:bg-accent disabled:opacity-50"><X className="size-5"/></button>
      </header>
      {complete ? <div className="mt-4 space-y-4" role="status">
        <p className="text-sm">{pt ? 'Denúncia recebida. O conteúdo foi registrado para análise da moderação.' : 'Report received for moderation review.'}</p>
        <p className="text-xs text-muted-foreground">{pt ? 'O autor não recebe seus dados pela denúncia. O conteúdo não será removido automaticamente.' : 'Your identity is not shared with the author. Content is not removed automatically.'}</p>
        <Button type="button" className="w-full" onClick={onClose}>{pt ? 'Concluir' : 'Done'}</Button>
      </div> : <form onSubmit={event => void submit(event)} className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{pt ? 'Selecione o motivo. A denúncia será registrada para análise.' : 'Choose a reason. The report will be recorded for review.'}</p>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>{pt ? 'Motivo da denúncia' : 'Reason for reporting'}</span>
          <select required value={reason} onChange={event => setReason(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">{pt ? 'Selecione um motivo' : 'Choose a reason'}</option>
            {reasons.map(([value,ptName,enName]) => <option value={value} key={value}>{pt ? ptName : enName}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>{pt ? 'Detalhes adicionais (opcional)' : 'Additional details (optional)'}</span>
          <textarea maxLength={1000} rows={3} value={details} onChange={event => setDetails(event.target.value)}
            placeholder={pt ? 'Explique o problema sem dados pessoais desnecessários.' : 'Explain the issue without unnecessary personal information.'}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
          <span className="block text-right text-xs text-muted-foreground">{details.length}/1000</span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{pt ? 'Cancelar' : 'Cancel'}</Button>
          <Button type="submit" disabled={!reason || busy} loading={busy}>{pt ? 'Enviar denúncia' : 'Submit report'}</Button>
        </div>
      </form>}
    </div>
  </div>, document.body);
}
