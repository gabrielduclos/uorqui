import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Flag, RefreshCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/skeleton';

type Status='pending'|'reviewing'|'resolved'|'dismissed';
type FilterStatus='all'|Status;
type Kind='post'|'direct_message'|'community_message';
type KindFilter='all'|Kind;
type Action='review'|'resolve'|'dismiss'|'remove';
type Report={
  id:string;targetKind:Kind;targetId:string;reason:string;details:string|null;
  evidence:{body?:string;attachmentId?:string|null;mediaIds?:string[]};
  status:Status;createdAt:string;reporterHandle:string;authorHandle:string|null;
  actionCount:number;
};
type ReportAction={id:string;action:Action;previousStatus:Status;nextStatus:Status;
  moderatorHandle:string|null;note:string|null;createdAt:string};
const kinds:Record<Kind,{pt:string;en:string}>={
  post:{pt:'Publicação',en:'Post'},
  direct_message:{pt:'Mensagem privada',en:'Direct message'},
  community_message:{pt:'Canal de texto',en:'Text channel'},
};
const statuses:Record<Status,{pt:string;en:string}>={
  pending:{pt:'Pendente',en:'Pending'},
  reviewing:{pt:'Em análise',en:'Reviewing'},
  resolved:{pt:'Resolvida',en:'Resolved'},
  dismissed:{pt:'Descartada',en:'Dismissed'},
};
const reasons:Record<string,{pt:string;en:string}>={
  spam:{pt:'Spam',en:'Spam'},harassment:{pt:'Assédio',en:'Harassment'},
  hate:{pt:'Discurso de ódio',en:'Hate speech'},
  sexual:{pt:'Conteúdo sexual',en:'Sexual content'},
  violence:{pt:'Violência',en:'Violence'},
  scam:{pt:'Fraude',en:'Scam'},privacy:{pt:'Privacidade',en:'Privacy'},
  other:{pt:'Outro',en:'Other'},
};
const actions:Record<Action,{pt:string;en:string}>={
  review:{pt:'Marcar em análise',en:'Start review'},
  resolve:{pt:'Resolver sem remover',en:'Resolve without removing'},
  dismiss:{pt:'Descartar denúncia',en:'Dismiss report'},
  remove:{pt:'Remover conteúdo',en:'Remove content'},
};
async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  if(!res.ok){
    const body=await res.json().catch(()=>null) as {error?:string}|null;
    throw Error(body?.error??String(res.status));
  }
  return res.json() as Promise<T>;
}

export default function ModerationPanel({locale}:{locale:string}){
  const pt=locale==='pt-BR';
  const [status,setStatus]=useState<FilterStatus>('pending');
  const [kind,setKind]=useState<KindFilter>('all');
  const [page,setPage]=useState(0);
  const [reports,setReports]=useState<Report[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [history,setHistory]=useState<ReportAction[]>([]);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [note,setNote]=useState('');
  const [pendingAction,setPendingAction]=useState<Action|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [revision,setRevision]=useState(0);
  const selectedReport=reports.find(x=>x.id===selected)??null;

  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void api<{reports:Report[];total:number}>('/api/v1/moderation/reports?status='+status+'&kind='+kind+'&page='+page)
      .then(data=>{if(active){setReports(data.reports);setTotal(data.total);}})
      .catch(err=>{if(active){setReports([]);setError(err instanceof Error&&err.message==='MODERATOR_REQUIRED'
        ?(pt?'Acesso administrativo não autorizado.':'Administrative access denied.')
        :(pt?'Não foi possível carregar as denúncias.':'Could not load reports.'));}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[status,kind,page,revision,pt]);

  useEffect(()=>{
    if(!selected){setHistory([]);return;}
    let active=true;setHistoryLoading(true);
    void api<{actions:ReportAction[]}>('/api/v1/moderation/reports/'+selected+'/actions')
      .then(data=>{if(active)setHistory(data.actions);})
      .catch(()=>{if(active)setHistory([]);})
      .finally(()=>{if(active)setHistoryLoading(false);});
    return ()=>{active=false;};
  },[selected,revision]);

  function changeFilter(nextStatus:FilterStatus,nextKind:KindFilter){
    setStatus(nextStatus);setKind(nextKind);setPage(0);setSelected(null);setNotice('');
  }
  async function submitAction(){
    if(!selectedReport||!pendingAction||busy)return;
    const action=pendingAction;
    setBusy(true);setError('');
    try{
      await api('/api/v1/moderation/reports/'+selectedReport.id+'/review',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,note:note.trim()})
      });
      setNotice(pt?'Decisão registrada.':'Decision saved.');
      setSelected(null);setNote('');setPendingAction(null);refresh();
    }catch(err){
      const code=err instanceof Error?err.message:'';
      if(code==='CONTENT_UNAVAILABLE')setError(pt?'O conteúdo já não está disponível. Resolva a denúncia sem remover.':'Content is already unavailable. Resolve without removal.');
      else if(code==='REPORT_ALREADY_CLOSED')setError(pt?'Esta denúncia já foi encerrada. Atualize a lista.':'This report was already closed. Refresh the list.');
      else setError(pt?'Não foi possível registrar a decisão.':'Could not save the decision.');
      setPendingAction(null);
    }finally{setBusy(false);}
  }
  const fmt=(value:string)=>new Date(value).toLocaleString(locale,{dateStyle:'short',timeStyle:'short'});
  const lastPage=Math.max(0,Math.ceil(total/25)-1);

  return <section className="flex h-full min-h-0 flex-col bg-background" aria-label={pt?'Moderação da plataforma':'Platform moderation'}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary"/>
        <div><h2 className="text-base font-semibold">{pt?'Moderação de denúncias':'Report moderation'}</h2>
          <p className="text-xs text-muted-foreground">{pt?'Área restrita à equipe autorizada da plataforma':'Restricted to authorized platform staff'}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={refresh} disabled={loading} className="gap-2">
        <RefreshCcw className="size-4"/>{pt?'Atualizar':'Refresh'}</Button>
    </header>

    <div className="flex shrink-0 flex-wrap gap-2 border-b border-border p-3 sm:px-6">
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {pt?'Status':'Status'}
        <select value={status} onChange={e=>changeFilter(e.target.value as FilterStatus,kind)}
          className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
          <option value="all">{pt?'Todos os status':'All statuses'}</option>
          {(Object.keys(statuses) as Status[]).map(s=><option value={s} key={s}>{pt?statuses[s].pt:statuses[s].en}</option>)}
        </select>
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {pt?'Tipo de conteúdo':'Content type'}
        <select value={kind} onChange={e=>changeFilter(status,e.target.value as KindFilter)}
          className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
          <option value="all">{pt?'Todos os tipos':'All types'}</option>
          {(Object.keys(kinds) as Kind[]).map(k=><option value={k} key={k}>{pt?kinds[k].pt:kinds[k].en}</option>)}
        </select>
      </label>
    </div>
    {notice&&<p role="status" className="mx-4 mt-3 rounded-lg border border-border bg-muted p-3 text-sm sm:mx-6">{notice}</p>}
    {error&&<p role="alert" className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-card p-3 text-sm text-destructive sm:mx-6">{error}</p>}

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
      {loading&&<SkeletonRows rows={5}/>}
      {!loading&&!reports.length&&!error&&<div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <Flag className="mx-auto mb-3 size-8"/>
        {pt?'Nenhuma denúncia encontrada para os filtros selecionados.':'No reports match the selected filters.'}
      </div>}
      {!loading&&<div className="mx-auto max-w-4xl space-y-3">
        {reports.map(report=>{
          const opened=selected===report.id;
          const close=()=>{setSelected(null);setNote('');setPendingAction(null);setError('');};
          return <article key={report.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <button type="button" onClick={()=>{
              if(opened)close();else{setSelected(report.id);setNote('');setPendingAction(null);setError('');}
            }} aria-expanded={opened} className="flex min-h-18 w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-accent/40">
              <span className="flex w-full flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{pt?kinds[report.targetKind].pt:kinds[report.targetKind].en}
                  {' · '}{pt?(reasons[report.reason]?.pt??report.reason):(reasons[report.reason]?.en??report.reason)}</strong>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs">{pt?statuses[report.status].pt:statuses[report.status].en}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                @{report.authorHandle??(pt?'conta removida':'removed account')}{' · '}{fmt(report.createdAt)}
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{report.evidence?.body?.slice(0,170)||(pt?'Conteúdo com mídia':'Media content')}</span>
            </button>
            {opened&&<div className="space-y-4 border-t border-border p-4">
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <p>{pt?'Denunciante':'Reported by'}: <strong className="text-foreground">@{report.reporterHandle}</strong></p>
                <p>{pt?'Autor':'Author'}: <strong className="text-foreground">@{report.authorHandle??'—'}</strong></p>
                <p>{pt?'Protocolo':'Report ID'}: <code className="select-all break-all">{report.id}</code></p>
                <p>{pt?'Registro':'Created'}: {fmt(report.createdAt)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{pt?'Conteúdo preservado na denúncia':'Evidence snapshot'}</p>
                <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm">{report.evidence?.body||(pt?'Sem texto':'No text')}</p>
                {(report.evidence?.attachmentId||(report.evidence?.mediaIds?.length??0)>0)&&
                  <p className="mt-2 text-xs text-muted-foreground">{pt?'A denúncia contém referência à mídia original.':'Report includes a reference to original media.'}</p>}
              </div>
              {report.details&&<p className="whitespace-pre-wrap break-words text-sm"><strong>{pt?'Detalhes':'Details'}: </strong>{report.details}</p>}
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-medium">{pt?'Histórico de decisões':'Decision history'}</h3>
                {historyLoading?<p className="text-xs text-muted-foreground">{pt?'Carregando…':'Loading…'}</p>:
                history.length?<div className="space-y-1">
                  {history.map(entry=><p key={entry.id} className="text-xs text-muted-foreground">
                    {fmt(entry.createdAt)} · @{entry.moderatorHandle??'—'} · {pt?actions[entry.action].pt:actions[entry.action].en}
                    {entry.note&&<span className="block whitespace-pre-wrap break-words pl-3">{entry.note}</span>}
                  </p>)}
                </div>:<p className="text-xs text-muted-foreground">{pt?'Sem decisões anteriores.':'No decisions yet.'}</p>}
              </div>
              {['pending','reviewing'].includes(report.status)&&<>
                <label className="block space-y-1 text-xs font-medium">
                  {pt?'Nota interna da moderação':'Internal moderation note'}
                  <textarea rows={2} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder={pt?'Motivo da decisão. Obrigatório para remoção.':'Reason for the decision. Required for removal.'}
                    className="mt-1 w-full resize-y rounded-lg border border-input bg-background p-3 text-base font-normal"/>
                </label>
                <div className="flex flex-wrap gap-2">
                  {report.status==='pending'&&<Button variant="outline" size="sm" disabled={busy}
                    onClick={()=>setPendingAction('review')}>{pt?actions.review.pt:actions.review.en}</Button>}
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={()=>setPendingAction('resolve')}><Check className="size-4"/>{pt?actions.resolve.pt:actions.resolve.en}</Button>
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={()=>setPendingAction('dismiss')}><X className="size-4"/>{pt?actions.dismiss.pt:actions.dismiss.en}</Button>
                  <Button variant="destructive" size="sm" disabled={busy||!note.trim()}
                    onClick={()=>setPendingAction('remove')}><Trash2 className="size-4"/>{pt?actions.remove.pt:actions.remove.en}</Button>
                </div>
              </>}
            </div>}
          </article>;
        })}
      </div>}
      {!loading&&total>0&&<div className="mx-auto mt-5 flex max-w-4xl items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{total} {pt?'denúncia(s)':'report(s)'}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page===0} onClick={()=>{setPage(p=>Math.max(0,p-1));setSelected(null);}}>
            <ChevronLeft className="size-4"/>{pt?'Anterior':'Previous'}</Button>
          <span>{page+1}/{lastPage+1}</span>
          <Button variant="outline" size="sm" disabled={page>=lastPage} onClick={()=>{setPage(p=>p+1);setSelected(null);}}>
            {pt?'Próximo':'Next'}<ChevronRight className="size-4"/></Button>
        </div>
      </div>}
    </div>
    {selectedReport&&pendingAction&&<div role="dialog" aria-modal="true" aria-label={pt?'Confirmar decisão':'Confirm decision'}
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <h3 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="size-5 text-destructive"/>
          {pt?'Confirmar decisão?':'Confirm decision?'}</h3>
        <p className="text-sm text-muted-foreground">
          {pendingAction==='remove'?
            (pt?'O conteúdo denunciado ficará indisponível para os usuários. A denúncia e o histórico de auditoria serão preservados.':
              'The reported content will be hidden from users. The report and audit history are retained.'):
            (pt?'Esta decisão será registrada no histórico e encerrará ou atualizará o atendimento.':
              'This action will be saved in the audit trail and update the review status.')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={()=>setPendingAction(null)}>{pt?'Voltar':'Back'}</Button>
          <Button variant={pendingAction==='remove'?'destructive':'default'} loading={busy} disabled={busy}
            onClick={()=>void submitAction()}>{pt?'Confirmar':'Confirm'}</Button>
        </div>
      </div>
    </div>}
  </section>;
}
