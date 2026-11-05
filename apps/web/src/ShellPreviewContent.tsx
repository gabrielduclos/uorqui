import { useState } from 'react';
import { Bell, CalendarDays, ChevronDown, Hash, Headphones, Mail, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, Settings2, Smile, Users, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

type PreviewArea = 'communities' | 'conversations' | 'email' | 'notifications' | 'profile';
type PreviewMessage = { name: string; time: string; body: string; initials: string; tone: string };

const channels = [
  { name: 'geral', icon: Hash },
  { name: 'avisos', icon: Hash },
  { name: 'planejamento', icon: Hash },
  { name: 'suporte', icon: Hash },
  { name: 'Reunião da equipe', icon: Video },
  { name: 'Sala de voz', icon: Headphones },
];
const demoMessages: PreviewMessage[] = [
  { name: 'Mariana Costa', time: '09:12', body: 'Bom dia, pessoal! Atualizei as informações do projeto para nossa reunião.', initials: 'MC', tone: 'bg-indigo-100 text-indigo-700' },
  { name: 'Lucas Almeida', time: '09:18', body: 'Perfeito! Já conferi o documento. Podemos revisar os próximos passos por aqui.', initials: 'LA', tone: 'bg-amber-100 text-amber-800' },
  { name: 'Fernanda Lima', time: '09:24', body: 'A equipe de operações já está alinhada. Vou compartilhar o resumo hoje.', initials: 'FL', tone: 'bg-emerald-100 text-emerald-800' },
];

function AvatarDemo({initials,tone}: {initials:string;tone:string}) {
  return <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold',tone)}>{initials}</span>;
}

export default function ShellPreviewContent({area}: {area:PreviewArea}) {
  const [channel,setChannel] = useState('geral');
  const [contact,setContact] = useState('Mariana Costa');
  const [draft,setDraft] = useState('');
  const [sent,setSent] = useState<PreviewMessage[]>([]);
  const isChat = area==='communities'||area==='conversations';
  const currentTitle = area==='communities' ? channel : contact;
  const submit = () => {
    if(!draft.trim())return;
    setSent(current=>[...current,{name:'Você',time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),body:draft.trim(),initials:'EU',tone:'bg-slate-200 text-slate-700'}]);
    setDraft('');
  };

  if(!isChat) {
    const title=area==='email'?'Caixa de entrada':area==='notifications'?'Notificações':'Configurações';
    const description=area==='email'?'Seus emails, organizados em um só lugar.':area==='notifications'?'Atualizações e atividades das suas equipes.':'Sua conta e preferências do Uorqui.';
    return <div data-sprintrix-preview className="flex h-full flex-col bg-card">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2 text-sm font-semibold">{area==='email'?<Mail className="size-4"/>:area==='notifications'?<Bell className="size-4"/>:<Settings2 className="size-4"/>}{title}</div>
        <button type="button" className="grid size-8 place-items-center rounded-lg border border-border"><MoreHorizontal className="size-4"/></button>
      </div>
      <div className="mx-auto w-full max-w-3xl p-6 md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Espaço de trabalho</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          {(area==='email' ? ['Resumo semanal • Equipe de projetos','Re: Atualização do cronograma','Convite para reunião de alinhamento'] : area==='notifications' ? ['Mariana mencionou você em #geral','Lucas compartilhou uma atualização','Novo convite de comunidade'] : ['Perfil e conta','Aparência e idioma','Privacidade e notificações']).map((item,i)=>
            <button type="button" key={item} className="flex w-full items-center gap-3 border-b border-border p-4 text-left last:border-b-0 hover:bg-secondary/60">
              <AvatarDemo initials={['MC','LA','FL'][i]} tone={['bg-indigo-100 text-indigo-700','bg-amber-100 text-amber-800','bg-emerald-100 text-emerald-800'][i]}/>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item}</span><span className="mt-1 block text-xs text-muted-foreground">Prévia demonstrativa do novo shell corporativo</span></span>
              <span className="text-[11px] text-muted-foreground">{['Agora','Ontem','Segunda'][i]}</span>
            </button>)}
        </div>
      </div>
    </div>;
  }

  return <div data-sprintrix-preview className="flex h-full min-h-0 bg-card">
    <aside data-sprintrix-context className="hidden h-full w-[224px] shrink-0 flex-col border-r border-border bg-card min-[620px]:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3.5">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">{area==='communities'?<Users className="size-4"/>:<MessageCircle className="size-4"/>}{area==='communities'?'Equipe geral':'Conversas'}<ChevronDown className="size-3 text-muted-foreground"/></span>
        <button type="button" title="Nova conversa" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary"><Plus className="size-4"/></button>
      </div>
      <div className="p-3">
        <button type="button" className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 text-xs text-muted-foreground">
          <Search className="size-3.5"/> Buscar {area==='communities'?'canal':'pessoas'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5">
        {area==='communities'?<>
          <p className="mb-2 mt-2 px-2 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Canais de texto</p>
          {channels.slice(0,4).map(item=>{const Icon=item.icon;return <button type="button" key={item.name} onClick={()=>{setChannel(item.name);setSent([]);}} aria-current={item.name===channel?'page':undefined}
            className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground',item.name===channel&&'bg-secondary font-semibold text-foreground')}>
            <Icon className="size-3.5"/><span className="truncate">{item.name}</span>
          </button>})}
          <p className="mb-2 mt-6 px-2 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Áudio e reuniões</p>
          {channels.slice(4).map(item=>{const Icon=item.icon;return <button type="button" key={item.name} onClick={()=>setChannel(item.name)} className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground"><Icon className="size-3.5"/><span className="truncate">{item.name}</span></button>})}
        </>:<>
          <p className="mb-2 mt-2 px-2 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Recentes</p>
          {['Mariana Costa','Lucas Almeida','Fernanda Lima','Equipe Comercial'].map((name,i)=><button type="button" key={name} onClick={()=>{setContact(name);setSent([]);}} aria-current={contact===name?'page':undefined}
            className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-secondary',contact===name&&'bg-secondary')}>
            <AvatarDemo initials={['MC','LA','FL','EC'][i]} tone={['bg-indigo-100 text-indigo-700','bg-amber-100 text-amber-800','bg-emerald-100 text-emerald-800','bg-slate-100 text-slate-700'][i]}/>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{name}</span><span className="block truncate text-[11px] text-muted-foreground">Última mensagem da conversa</span></span>
          </button>)}
        </>}
      </div>
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">Prévia visual • dados ilustrativos</div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col bg-card">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {area==='communities'?<Hash className="size-[17px] text-muted-foreground"/>:<AvatarDemo initials={contact.split(' ').map(x=>x[0]).join('').slice(0,2)} tone="bg-indigo-100 text-indigo-700"/>}
          <div className="min-w-0"><h2 className="truncate text-[13px] font-semibold">{currentTitle}</h2>{area==='conversations'&&<p className="text-[11px] text-muted-foreground">Disponível</p>}</div>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button type="button" className="grid size-8 place-items-center rounded-lg hover:bg-secondary" title="Buscar"><Search className="size-4"/></button>
          <button type="button" className="grid size-8 place-items-center rounded-lg hover:bg-secondary" title="Opções"><MoreHorizontal className="size-4"/></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-7 md:px-9">
        <div className="mb-8 border-b border-border pb-5">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl border border-border bg-secondary text-foreground">{area==='communities'?<Hash className="size-5"/>:<MessageCircle className="size-5"/>}</div>
          <h1 className="text-xl font-semibold tracking-tight">{area==='communities'?'Bem-vindo a #'+channel:contact}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{area==='communities'?'Espaço para alinhar tarefas, compartilhar ideias e acompanhar decisões.':'Suas mensagens diretas aparecem aqui.'}</p>
        </div>
        <div className="mb-6 flex items-center gap-3"><div className="h-px flex-1 bg-border"/><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hoje</span><div className="h-px flex-1 bg-border"/></div>
        <div className="space-y-6">
          {[...demoMessages,...sent].map((message,i)=><article key={i} className="group flex gap-3">
            <AvatarDemo initials={message.initials} tone={message.tone}/>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] font-semibold">{message.name}</span><time className="text-[10px] text-muted-foreground">{message.time}</time></div>
              <p className="mt-1 max-w-3xl text-[13px] leading-[1.7] text-foreground/90">{message.body}</p>
            </div>
          </article>)}
        </div>
      </div>
      <form onSubmit={event=>{event.preventDefault();submit();}} className="shrink-0 px-3 pb-4 md:px-7 md:pb-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_2px_10px_rgba(0,0,0,.035)] focus-within:border-ring">
          <input value={draft} onChange={event=>setDraft(event.target.value)} placeholder={'Mensagem para '+(area==='communities'?'#'+channel:contact)} aria-label="Escrever mensagem" className="h-12 w-full bg-transparent px-4 text-[13px] outline-none placeholder:text-muted-foreground"/>
          <div className="flex items-center justify-between border-t border-border/80 px-2.5 py-2">
            <div className="flex gap-1 text-muted-foreground"><button type="button" title="Anexar" className="grid size-7 place-items-center rounded-md hover:bg-secondary"><Paperclip className="size-4"/></button><button type="button" title="Emoji" className="grid size-7 place-items-center rounded-md hover:bg-secondary"><Smile className="size-4"/></button></div>
            <button type="submit" disabled={!draft.trim()} className="flex h-7 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background disabled:opacity-40">Enviar<Send className="size-3"/></button>
          </div>
        </div>
      </form>
    </main>
  </div>;
}
