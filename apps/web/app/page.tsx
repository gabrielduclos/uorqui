'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UorquiWordmark } from './UorquiWordmark';
import {
  ArrowLeft, Bell, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp,
  Command, ContactRound, FileText, FolderKanban, Globe2, Hash, Inbox,
  LayoutGrid, List, LockKeyhole, Menu, MessageCircle, MessageSquare,
  Mic, Moon, MoreHorizontal, Palette, PanelLeft, Paperclip, Phone,
  Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Smile,
  Sun, UserPlus, Users, Video, X
} from 'lucide-react';

type Screen = 'canais' | 'mensagens' | 'entrada' | 'reunioes' | 'contatos' | 'clientes' | 'configuracoes';
type ChannelGroup = 'Fixados' | 'Operação' | 'Projetos' | 'Clientes';
type Channel = {
  id: string; code: string; name: string; group: ChannelGroup; team: string;
  labels: string[]; people: string[]; updated: string; unread: number;
  description: string; isPrivate?: boolean;
};
type ChatMessage = { id: string; author: string; initials: string; body: string; at: string; mine?: boolean; fileName?: string };
type Contact = { id: string; name: string; role: string; team: string; online: boolean; initials: string; updated: string; unread: number; snippet: string };

const startingChannels: Channel[] = [
  { id:'turno', code:'OPS-01', name:'Passagem de turno', group:'Fixados', team:'Operação', labels:['Operação','Interno'], people:['RC','CM','GA'], updated:'agora', unread:4, description:'Alinhamentos entre os turnos e ocorrências da operação.' },
  { id:'avisos', code:'GER-01', name:'Avisos gerais', group:'Fixados', team:'Geral', labels:['Comunicados'], people:['GA','ML'], updated:'há 8 min', unread:2, description:'Informações importantes para toda a empresa.' },
  { id:'manutencao', code:'OPS-02', name:'Equipe de manutenção', group:'Operação', team:'Operação', labels:['Manutenção'], people:['GA','RC','FT'], updated:'há 12 min', unread:3, description:'Ordens de serviço, intervenções e suporte técnico.' },
  { id:'incubatorio', code:'OPS-03', name:'Incubatório', group:'Operação', team:'Operação', labels:['Produção','Operação'], people:['CM','LR'], updated:'há 25 min', unread:0, description:'Acompanhamento das rotinas do incubatório.' },
  { id:'campo', code:'OPS-04', name:'Técnicos em campo', group:'Operação', team:'Operação', labels:['Campo'], people:['FT','GA','PS'], updated:'há 38 min', unread:0, description:'Comunicação entre técnicos e equipe de apoio.' },
  { id:'suporte', code:'OPS-05', name:'Suporte interno', group:'Operação', team:'Operação', labels:['Suporte'], people:['ML','RC'], updated:'há 1 h', unread:1, description:'Dúvidas e solicitações operacionais.' },
  { id:'produto', code:'PRJ-01', name:'Desenvolvimento do produto', group:'Projetos', team:'Projetos', labels:['Produto','Tecnologia'], people:['GA','ML','PS'], updated:'há 2 h', unread:0, description:'Planejamento e evolução dos produtos digitais.' },
  { id:'implantacao', code:'PRJ-02', name:'Implantação de clientes', group:'Projetos', team:'Projetos', labels:['Implantação'], people:['RC','PS'], updated:'ontem', unread:0, description:'Cronograma e atividades de implantação.' },
  { id:'integracoes', code:'PRJ-03', name:'Integrações e APIs', group:'Projetos', team:'Projetos', labels:['Tecnologia'], people:['GA','FT'], updated:'ontem', unread:0, description:'Pontos de integração e sistemas.' },
  { id:'cliente-a', code:'CLI-01', name:'Cliente · Unidade Piracicaba', group:'Clientes', team:'Clientes', labels:['Cliente','Externo'], people:['CM','GA'], updated:'há 3 h', unread:1, description:'Canal compartilhado com o cliente para atendimento e acompanhamento.', isPrivate:true },
  { id:'cliente-b', code:'CLI-02', name:'Cliente · Unidade Santos', group:'Clientes', team:'Clientes', labels:['Cliente','Externo'], people:['ML','PS'], updated:'ontem', unread:0, description:'Relacionamento e suporte à unidade do cliente.', isPrivate:true }
];
const contacts: Contact[] = [
  {id:'renato',name:'Renato Costa',role:'Supervisor de manutenção',team:'Operação',online:true,initials:'RC',updated:'agora',unread:2,snippet:'Consegui verificar o equipamento.'},
  {id:'carolina',name:'Carolina Martins',role:'Coordenadora de produção',team:'Operação',online:true,initials:'CM',updated:'há 9 min',unread:1,snippet:'Combinado, vamos alinhar no próximo turno.'},
  {id:'mariana',name:'Mariana Lima',role:'Administrativo',team:'Geral',online:false,initials:'ML',updated:'há 45 min',unread:0,snippet:'Enviei a planilha atualizada.'},
  {id:'felipe',name:'Felipe Torres',role:'Técnico de campo',team:'Operação',online:true,initials:'FT',updated:'ontem',unread:0,snippet:'Obrigado pelo retorno!'},
  {id:'paula',name:'Paula Souza',role:'Relacionamento com clientes',team:'Clientes',online:false,initials:'PS',updated:'terça-feira',unread:0,snippet:'Podemos agendar uma reunião?'}
];
const initialMessages: Record<string, ChatMessage[]> = {
  turno: [
    {id:'t1',author:'Carolina Martins',initials:'CM',body:'Bom dia, equipe! Deixei registradas as ocorrências do primeiro turno.',at:'08:42'},
    {id:'t2',author:'Renato Costa',initials:'RC',body:'Recebido. Vou acompanhar os pontos de manutenção e retorno por aqui.',at:'08:45'},
    {id:'t3',author:'Carolina Martins',initials:'CM',body:'Perfeito! Precisamos confirmar a liberação da linha antes do próximo turno.',at:'08:47'},
    {id:'t4',author:'Você',initials:'GA',body:'Vou conferir e aviso assim que estiver liberado.',at:'08:50',mine:true}
  ],
  manutencao:[
    {id:'m1',author:'Renato Costa',initials:'RC',body:'Pessoal, já podemos revisar o plano de manutenção desta semana.',at:'09:10'},
    {id:'m2',author:'Felipe Torres',initials:'FT',body:'Estou finalizando os apontamentos do atendimento de ontem.',at:'09:12'},
    {id:'m3',author:'Você',initials:'GA',body:'Ótimo. Vamos centralizar as atualizações neste canal.',at:'09:14',mine:true}
  ],
  'dm:renato':[
    {id:'d1',author:'Renato Costa',initials:'RC',body:'Você conseguiu conferir aquele equipamento?',at:'09:18'},
    {id:'d2',author:'Você',initials:'GA',body:'Sim, já atualizei o relatório.',at:'09:20',mine:true},
    {id:'d3',author:'Renato Costa',initials:'RC',body:'Consegui verificar o equipamento. Tudo certo.',at:'09:21'}
  ],
  'dm:carolina':[
    {id:'d4',author:'Carolina Martins',initials:'CM',body:'Vamos alinhar a programação do próximo turno?',at:'08:30'},
    {id:'d5',author:'Você',initials:'GA',body:'Claro, pode enviar os pontos por aqui.',at:'08:32',mine:true}
  ]
};
const groups: ChannelGroup[] = ['Fixados','Operação','Projetos','Clientes'];
const avatarColors: Record<string,string> = {GA:'#242424',RC:'#7d8f9d',CM:'#ad817c',ML:'#9f87a9',FT:'#769c86',PS:'#b89565'};
const timeNow = () => new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const fallbackMessages = (name:string):ChatMessage[] => [{id:'welcome',author:'Sistema',initials:'U',body:'Bem-vindo(a) a '+name+'. Esta é uma prévia de interface com dados de demonstração.',at:'09:00'}];

function Avatar({initials,size='sm',online=false}:{initials:string;size?:'sm'|'md'|'lg';online?:boolean}) {
  return <span className={'avatar avatar--'+size} style={{background:avatarColors[initials] || '#8b92a5'}} title={initials}>{initials}{online&&<i className="avatar-online"/>}</span>;
}
function AvatarStack({people}:{people:string[]}) {
  return <span className="avatar-stack">{people.slice(0,3).map((p,i)=><span key={p+i} className="avatar-stack__item"><Avatar initials={p}/></span>)}</span>;
}
function Count({value}:{value:number}) {return value>0?<span className="counter">{value}</span>:null;}

export default function HomePage() {
  const [screen,setScreen]=useState<Screen>('canais');
  const [channels,setChannels]=useState<Channel[]>(startingChannels);
  const [activeChannelId,setActiveChannelId]=useState<string|null>(null);
  const [activeContactId,setActiveContactId]=useState<string|null>(null);
  const [messages,setMessages]=useState<Record<string,ChatMessage[]>>(initialMessages);
  const [unreadChannels,setUnreadChannels]=useState<Record<string,number>>({});
  const [unreadContacts,setUnreadContacts]=useState<Record<string,number>>({});
  const [tab,setTab]=useState('Todos');
  const [display,setDisplay]=useState<'list'|'board'>('list');
  const [dark,setDark]=useState(false);
  const [dense,setDense]=useState(true);
  const [sideCollapsed,setSideCollapsed]=useState(false);
  const [mobileNav,setMobileNav]=useState(false);
  const [closedGroups,setClosedGroups]=useState<string[]>([]);
  const [closedTeams,setClosedTeams]=useState<string[]>([]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [newName,setNewName]=useState('');
  const [newPrivate,setNewPrivate]=useState(false);
  const [draft,setDraft]=useState('');
  const [infoOpen,setInfoOpen]=useState(false);
  const [viewOptions,setViewOptions]=useState(false);
  const [toast,setToast]=useState('');
  const scrollEnd=useRef<HTMLDivElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const messageInput=useRef<HTMLTextAreaElement>(null);

  const activeChannel=channels.find(c=>c.id===activeChannelId);
  const activeContact=contacts.find(c=>c.id===activeContactId);
  const conversationKey=activeChannel?'channel:'+activeChannel.id:activeContact?'dm:'+activeContact.id:null;
  const currentMessages=conversationKey?(messages[conversationKey]||messages[activeChannelId||'']||fallbackMessages(activeChannel?.name||activeContact?.name||'')):[];
  const chatting=Boolean(activeChannel||activeContact);
  const title=activeChannel?.name||activeContact?.name||({canais:'Canais',mensagens:'Mensagens',entrada:'Caixa de entrada',reunioes:'Reuniões',contatos:'Contatos',clientes:'Clientes',configuracoes:'Configurações'}[screen]);
  const unreadFor=(c:Channel)=>unreadChannels[c.id]??c.unread;
  const unreadForContact=(c:Contact)=>unreadContacts[c.id]??c.unread;
  const totalUnread=channels.reduce((sum,c)=>sum+unreadFor(c),0)+contacts.reduce((sum,c)=>sum+unreadForContact(c),0);
  const totalMessages=contacts.reduce((sum,c)=>sum+unreadForContact(c),0);

  const visibleChannels=useMemo(()=>channels.filter(c=>{
    if(tab==='Não lidos' && unreadFor(c)===0)return false;
    if(tab==='Participando' && c.group==='Clientes')return false;
    if(tab==='Arquivados')return false;
    return true;
  }),[channels,tab,unreadChannels]);
  const searchResults=useMemo(()=>{
    const q=search.toLocaleLowerCase('pt-BR').trim();
    return { channels:channels.filter(c=>!q||[c.name,c.code,c.team,c.description].join(' ').toLowerCase().includes(q)).slice(0,8),
      contacts:contacts.filter(c=>!q||[c.name,c.role,c.team].join(' ').toLowerCase().includes(q)).slice(0,5)};
  },[search,channels]);

  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setSearchOpen(v=>!v);}
      if(event.key==='Escape'){setSearchOpen(false);setCreateOpen(false);setInfoOpen(false);setViewOptions(false);setMobileNav(false);}
    };
    document.addEventListener('keydown',listener);
    return ()=>document.removeEventListener('keydown',listener);
  },[]);
  useEffect(()=>{scrollEnd.current?.scrollIntoView({behavior:'smooth',block:'end'});},[activeChannelId,activeContactId,messages]);
  useEffect(()=>{
    if(!toast)return;
    const t=window.setTimeout(()=>setToast(''),3200);
    return ()=>window.clearTimeout(t);
  },[toast]);

  function navigate(next:Screen){
    setScreen(next);setActiveChannelId(null);setActiveContactId(null);setTab('Todos');setMobileNav(false);setInfoOpen(false);
  }
  function openChannel(c:Channel){
    setScreen('canais');setActiveChannelId(c.id);setActiveContactId(null);setMobileNav(false);setSearchOpen(false);setInfoOpen(false);
    setUnreadChannels(prev=>({...prev,[c.id]:0}));
  }
  function openContact(c:Contact){
    setScreen('mensagens');setActiveContactId(c.id);setActiveChannelId(null);setMobileNav(false);setSearchOpen(false);setInfoOpen(false);
    setUnreadContacts(prev=>({...prev,[c.id]:0}));
  }
  function toggleGroup(name:string){setClosedGroups(prev=>prev.includes(name)?prev.filter(g=>g!==name):[...prev,name]);}
  function toggleTeam(name:string){setClosedTeams(prev=>prev.includes(name)?prev.filter(g=>g!==name):[...prev,name]);}
  function sendMessage(fileName?:string){
    const body=draft.trim();
    if(!body&&!fileName)return;
    if(!conversationKey)return;
    const newMessage:ChatMessage={id:'local-'+Date.now()+'-'+Math.random(),author:'Você',initials:'GA',body:fileName?'Arquivo: '+fileName:body,at:timeNow(),mine:true,fileName};
    setMessages(prev=>({...prev,[conversationKey]:[...(prev[conversationKey]||prev[activeChannelId||'']||fallbackMessages(title)),newMessage]}));
    setDraft('');window.requestAnimationFrame(()=>messageInput.current?.focus());
  }
  function createChannel(){
    const cleanName=newName.trim();
    if(!cleanName)return;
    const id='custom-'+Date.now();
    const channel:Channel={id,code:'NOVO-'+String(channels.length+1).padStart(2,'0'),name:cleanName,group:'Projetos',team:'Projetos',
      labels:[newPrivate?'Privado':'Interno'],people:['GA'],updated:'agora',unread:0,
      description:'Canal criado nesta prévia visual.',isPrivate:newPrivate};
    setChannels(prev=>[...prev,channel]);setCreateOpen(false);setNewName('');setNewPrivate(false);setTab('Todos');openChannel(channel);
    setToast('Canal criado nesta sessão de demonstração.');
  }
  const navItems=[
    {key:'entrada' as Screen,label:'Caixa de entrada',icon:Inbox,count:totalUnread},
    {key:'mensagens' as Screen,label:'Mensagens',icon:MessageSquare,count:totalMessages}
  ];
  const workspaceItems=[
    {key:'canais' as Screen,label:'Canais',icon:Hash},
    {key:'reunioes' as Screen,label:'Reuniões',icon:Video},
    {key:'contatos' as Screen,label:'Contatos',icon:Users},
    {key:'clientes' as Screen,label:'Clientes',icon:FolderKanban}
  ];
  const tabs=screen==='canais'?['Todos','Não lidos','Participando','Arquivados']:screen==='mensagens'?['Todas','Não lidas','Arquivadas']:screen==='entrada'?['Tudo','Não lidas','Menções']:['Todos','Ativos'];
  function SidebarNav({item}:{item:{key:Screen;label:string;icon:typeof Inbox;count?:number}}){
    const I=item.icon;
    return <button type="button" title={sideCollapsed?item.label:undefined} className={'nav-item '+(screen===item.key&&!chatting?'nav-item--active':'')} onClick={()=>navigate(item.key)}>
      <I size={17} strokeWidth={1.75}/><span className="sidebar-label">{item.label}</span>
      {typeof item.count==='number'&&item.count>0&&<span className="sidebar-count sidebar-label">{item.count}</span>}
    </button>;
  }
  const channelGroups=groups.map(group=>({group,items:visibleChannels.filter(c=>c.group===group)})).filter(item=>item.items.length>0);
  return <div className={'app '+(sideCollapsed?'app--compact ':'')+(dense?'app--dense ':'')} data-theme={dark?'dark':'light'}>
    {mobileNav&&<button type="button" className="sidebar-scrim" aria-label="Fechar navegação" onClick={()=>setMobileNav(false)}/>}
    <aside className={'sidebar '+(mobileNav?'sidebar--open':'')}>
      <div className="brandbar">
        <button type="button" className="brand" onClick={()=>navigate('canais')} title="Workspace Uorqui"><UorquiWordmark className="brand-wordmark" /></button>
        <div className="brand-actions"><button type="button" className="mini-icon" aria-label="Buscar" title="Buscar (Ctrl+K)" onClick={()=>setSearchOpen(true)}><Search size={17}/></button><button type="button" className="mini-icon" aria-label="Criar canal" title="Criar canal" onClick={()=>setCreateOpen(true)}><Plus size={18}/></button></div>
      </div>
      <div className="sidebar-scroll">
        <nav className="nav-block" aria-label="Mensagens">{navItems.map(item=><SidebarNav key={item.key} item={item}/>)}</nav>
        <div className="nav-section-heading"><span className="sidebar-label">Workspace</span><ChevronDown size={14} className="sidebar-label"/></div>
        <nav className="nav-block" aria-label="Workspace">{workspaceItems.map(item=><SidebarNav key={item.key} item={item}/>)}</nav>
        <div className="nav-section-heading teams-heading"><span className="sidebar-label">Suas equipes</span><button type="button" className="mini-icon sidebar-label" aria-label="Novo canal de equipe" onClick={()=>setCreateOpen(true)}><Plus size={16}/></button></div>
        {[
          {name:'Operação',ab:'O',color:'#3d81dc',channels:['turno','manutencao','incubatorio','campo']},
          {name:'Projetos',ab:'P',color:'#af60d6',channels:['produto','implantacao','integracoes']},
          {name:'Clientes',ab:'C',color:'#f28b3b',channels:['cliente-a','cliente-b']}
        ].map(team=><div className="team" key={team.name}>
          <button type="button" className="team-heading" onClick={()=>{if(sideCollapsed){navigate('canais');return;}toggleTeam(team.name);}}>
            <span className="team-icon" style={{background:team.color}}>{team.ab}</span><span className="team-name sidebar-label">{team.name}</span>
            {closedTeams.includes(team.name)?<ChevronRight className="team-chevron sidebar-label" size={14}/>:<ChevronDown className="team-chevron sidebar-label" size={14}/>}
          </button>
          {!closedTeams.includes(team.name)&&<div className="team-links sidebar-label">
            <button type="button" onClick={()=>{navigate('canais');setTab('Todos');}}>Canais</button>
            <button type="button" onClick={()=>navigate('contatos')}>Membros</button>
            <button type="button" onClick={()=>navigate('reunioes')}>Reuniões</button>
          </div>}
        </div>)}
        <div className="nav-section-heading miscellaneous sidebar-label"><span>Geral</span></div>
        <nav className="nav-block"><SidebarNav item={{key:'configuracoes',label:'Configurações',icon:Settings2}}/></nav>
      </div>
      <div className="sidebar-bottom"><button type="button" className="help" aria-label="Sobre esta prévia" title="Sobre esta prévia" onClick={()=>setToast('Interface demonstrativa. Integração com autenticação e API ainda não realizada.')}><CircleHelp size={17}/></button><span className="preview-note sidebar-label">Prévia visual • Sem API</span></div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <button type="button" className="icon-button sidebar-toggle" title="Recolher ou abrir menu" aria-label="Alternar navegação" onClick={()=>{if(window.innerWidth<=760)setMobileNav(v=>!v);else setSideCollapsed(v=>!v);}}><PanelLeft size={19} strokeWidth={1.75}/></button>
        <span className="topbar-divider"/>
        {chatting&&<button type="button" className="icon-button back-control" aria-label="Voltar à lista" onClick={()=>{setActiveContactId(null);setActiveChannelId(null);}}><ArrowLeft size={17}/></button>}
        <span className="topbar-title">{activeChannel&&<Hash size={16} className="title-hash"/>}{title}</span>
        <div className="topbar-right">
          {chatting&&<button type="button" className="icon-button hidden-on-mobile" aria-label="Informações da conversa" onClick={()=>setInfoOpen(v=>!v)}><Users size={17}/></button>}
          <button type="button" className="icon-button" aria-label={dark?'Ativar modo claro':'Ativar modo escuro'} title={dark?'Modo claro':'Modo escuro'} onClick={()=>setDark(v=>!v)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
          <button type="button" className="icon-button" aria-label="Opções de aparência" title="Aparência" onClick={()=>{setViewOptions(v=>!v);setInfoOpen(false);}}><Palette size={17}/></button>
          {viewOptions&&<div className="floating-menu appearance-menu">
            <span className="menu-heading">Aparência</span>
            <button type="button" onClick={()=>setDark(false)}><Sun size={15}/> Claro {dark===false&&<Check size={15} className="menu-check"/>}</button>
            <button type="button" onClick={()=>setDark(true)}><Moon size={15}/> Escuro {dark===true&&<Check size={15} className="menu-check"/>}</button>
            <button type="button" onClick={()=>setDense(v=>!v)}><List size={15}/> Linhas compactas {dense&&<Check size={15} className="menu-check"/>}</button>
          </div>}
        </div>
      </header>

      {chatting ? <div className="conversation-layout">
        <div className="conversation-main">
          <div className="conversation-heading"><div className="conversation-identity">
            {activeChannel?<span className="conversation-symbol"><Hash size={19}/></span>:<Avatar initials={activeContact!.initials} size="lg" online={activeContact!.online}/>}
            <div><h1>{title}</h1><p>{activeChannel?(activeChannel.isPrivate?'Canal privado':'Canal da equipe')+' · '+activeChannel.people.length+' participantes':activeContact?.role}</p></div>
          </div><div className="conversation-actions">
            <button type="button" className="icon-button" aria-label="Detalhes" title="Detalhes" onClick={()=>setInfoOpen(v=>!v)}><MoreHorizontal size={18}/></button>
            <button type="button" className="icon-button" aria-label="Iniciar chamada (indisponível)" title="Chamada indisponível na prévia" onClick={()=>setToast('Chamadas ainda não estão conectadas à API nesta prévia.')}><Phone size={17}/></button>
            <button type="button" className="icon-button" aria-label="Iniciar reunião (indisponível)" title="Reunião indisponível na prévia" onClick={()=>setToast('Reuniões ainda não estão conectadas à API nesta prévia.')}><Video size={18}/></button>
          </div></div>
          <div className="messages-area">
            <div className="conversation-intro">{activeChannel?<span className="intro-icon"><Hash size={25}/></span>:<Avatar initials={activeContact!.initials} size="lg"/>}
              <h2>{activeChannel?'Início do canal #'+activeChannel.name:'Conversa com '+activeContact?.name}</h2>
              <p>{activeChannel?.description||'Mensagens diretas entre membros do workspace.'}</p>
            </div>
            <div className="messages-day"><span>Hoje</span></div>
            {currentMessages.map(m=><div className={'chat-message '+(m.mine?'chat-message--mine':'')} key={m.id}>
              <Avatar initials={m.initials} size="md"/><div className="chat-message-content"><div className="chat-meta"><strong>{m.author}</strong><time>{m.at}</time></div><p>{m.body}</p>{m.mine&&<span className="message-read"><CheckCheck size={13}/> Enviada nesta sessão</span>}</div>
            </div>)}
            <div ref={scrollEnd}/>
          </div>
          <div className="composer-shell"><div className="composer">
            <textarea ref={messageInput} rows={1} value={draft} onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}}
              placeholder={'Mensagem para '+(activeChannel?'#'+activeChannel.name:activeContact?.name)} aria-label="Digite uma mensagem"/>
            <div className="composer-actions"><div className="composer-left">
              <button type="button" className="icon-button" aria-label="Anexar arquivo" title="Anexar arquivo" onClick={()=>fileInput.current?.click()}><Paperclip size={17}/></button>
              <button type="button" className="icon-button" aria-label="Inserir emoji" title="Inserir emoji" onClick={()=>{setDraft(v=>v+' 🙂');messageInput.current?.focus();}}><Smile size={18}/></button>
              <input ref={fileInput} hidden type="file" multiple onChange={e=>{const files=Array.from(e.target.files||[]);files.forEach(file=>sendMessage(file.name));e.target.value='';}}/>
            </div><div className="composer-right"><span>Enter para enviar</span><button type="button" className="send-button" disabled={!draft.trim()} onClick={()=>sendMessage()} aria-label="Enviar mensagem"><Send size={17}/></button></div></div>
          </div><span className="composer-disclaimer">Prévia local: mensagens e anexos não são enviados ao servidor.</span></div>
        </div>
        {infoOpen&&<aside className="conversation-info"><div className="info-title"><strong>Detalhes</strong><button type="button" className="icon-button" aria-label="Fechar detalhes" onClick={()=>setInfoOpen(false)}><X size={17}/></button></div><h3>{title}</h3><p>{activeChannel?.description||activeContact?.role}</p><div className="info-line"><Users size={16}/>{activeChannel?activeChannel.people.length+' participantes':activeContact?.team}</div><div className="info-line">{activeChannel?.isPrivate?<LockKeyhole size={16}/>:<Globe2 size={16}/>} {activeChannel?(activeChannel.isPrivate?'Privado':'Disponível no workspace'):'Mensagem direta'}</div><button type="button" className="secondary-button" onClick={()=>setToast('Convites serão habilitados após a integração com contas.')}> <UserPlus size={15}/> Convidar pessoas</button></aside>}
      </div> : <>
        {screen!=='configuracoes'&&<div className="content-toolbar"><div className="count-summary">{screen==='canais'?channels.length+' canais':screen==='mensagens'?contacts.length+' conversas':screen==='entrada'?totalUnread+' notificações':screen==='reunioes'?'3 salas disponíveis':screen==='contatos'?contacts.length+' pessoas':'2 organizações'}</div>
          <div className="toolbar-actions">
            <button type="button" className="outlined-button view-button" onClick={()=>setViewOptions(v=>!v)}><SlidersHorizontal size={16}/> <span>Visualização</span></button>
            {(screen==='canais'||screen==='mensagens')&&<div className="segmented"><button type="button" className={display==='list'?'segmented--selected':''} onClick={()=>setDisplay('list')}><List size={15}/> Lista</button><button type="button" className={display==='board'?'segmented--selected':''} onClick={()=>setDisplay('board')}><LayoutGrid size={15}/> Quadro</button></div>}
            <button type="button" className="primary-button" onClick={()=>{if(screen==='mensagens'){setSearchOpen(true);}else if(screen==='reunioes'){setToast('Agendamento disponível após conectar a API.');}else{setCreateOpen(true);}}}><Plus size={16}/><span>{screen==='canais'?'Novo canal':screen==='mensagens'?'Nova conversa':screen==='reunioes'?'Nova reunião':screen==='clientes'?'Novo cliente':'Novo'}</span></button>
          </div>
        </div>}
        {(screen==='canais'||screen==='mensagens'||screen==='entrada')&&<nav className="tabs" aria-label="Filtros">{tabs.map(t=><button type="button" key={t} className={tab===t||tab==='Todos'&&t===tabs[0]?'tab--active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>}

        <div className="content-scroll" key={screen}>
          {screen==='canais'&& (visibleChannels.length===0?<div className="empty-state"><Hash size={27}/><h2>Nenhum canal encontrado</h2><p>Escolha outro filtro ou crie um novo canal.</p><button type="button" className="primary-button" onClick={()=>setTab('Todos')}>Ver todos os canais</button></div>:display==='list'?
            <div className="group-list">{channelGroups.map(({group,items})=><section className="issue-group" key={group}>
              <button type="button" className="group-title" onClick={()=>toggleGroup(group)}>{closedGroups.includes(group)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<span className={'group-status group-status--'+group.toLowerCase().replace('ç','c')}/><strong>{group}</strong><span>{items.length} {items.length===1?'canal':'canais'}</span></button>
              {!closedGroups.includes(group)&&<div className="issue-rows">{items.map(c=><button type="button" className="issue-row" key={c.id} onClick={()=>openChannel(c)}>
                <span className={'row-priority '+(unreadFor(c)?'row-priority--unread':'')}><Hash size={15}/></span>
                <span className="row-code">{c.code}</span>
                <span className="row-name">{c.name}{unreadFor(c)>0&&<span className="row-unread-dot"/>}</span>
                <span className="row-tags">{c.labels.map(l=><span className="tag" key={l}>{l}</span>)}{c.isPrivate&&<LockKeyhole size={13}/>}</span>
                <AvatarStack people={c.people}/>
                <span className="row-age">{c.updated}</span>
              </button>)}</div>}
            </section>)}</div>:
            <div className="board-view">{channelGroups.map(({group,items})=><div className="board-column" key={group}><div className="board-heading"><span className="group-status"/><strong>{group}</strong><span>{items.length}</span></div>{items.map(c=><button type="button" className="board-card" key={c.id} onClick={()=>openChannel(c)}><span className="board-code">{c.code}</span><strong>{c.name}</strong><p>{c.description}</p><div className="board-card-foot"><span className="tag">{c.labels[0]}</span><AvatarStack people={c.people}/></div></button>)}</div>)}</div>)}
          {screen==='mensagens'&&(display==='list'?<div className="group-list"><section className="issue-group"><div className="group-title group-title--static"><MessageCircle size={15}/><strong>Conversas diretas</strong><span>{contacts.length} contatos</span></div><div className="issue-rows">{contacts.filter(c=>tab!=='Não lidas'||unreadForContact(c)>0).filter(()=>tab!=='Arquivadas').map(c=><button type="button" className="issue-row contact-row" key={c.id} onClick={()=>openContact(c)}><Avatar initials={c.initials} size="md" online={c.online}/><span className="contact-main"><strong>{c.name}</strong><small>{c.snippet}</small></span><span className="contact-team tag">{c.team}</span>{unreadForContact(c)>0&&<Count value={unreadForContact(c)}/>}<span className="row-age">{c.updated}</span></button>)}</div></section></div>:<div className="contacts-board">{contacts.map(c=><button type="button" className="contact-card" key={c.id} onClick={()=>openContact(c)}><Avatar initials={c.initials} size="lg" online={c.online}/><strong>{c.name}</strong><span>{c.role}</span><small>{c.team}</small></button>)}</div>)}
          {screen==='entrada'&&<div className="group-list"><section className="issue-group"><div className="group-title group-title--static"><Bell size={15}/><strong>Atividade recente</strong><span>{totalUnread} pendentes</span></div><div className="issue-rows">{channels.filter(c=>unreadFor(c)>0).map(c=><button type="button" className="issue-row notification-row" key={c.id} onClick={()=>openChannel(c)}><span className="notification-icon"><Hash size={16}/></span><span className="contact-main"><strong>Novas mensagens em {c.name}</strong><small>{unreadFor(c)} mensagens aguardando leitura</small></span><span className="row-age">{c.updated}</span><span className="notification-marker"/></button>)}{contacts.filter(c=>unreadForContact(c)>0).map(c=><button type="button" className="issue-row notification-row" key={c.id} onClick={()=>openContact(c)}><Avatar initials={c.initials} size="md"/><span className="contact-main"><strong>{c.name} enviou uma mensagem</strong><small>{c.snippet}</small></span><span className="row-age">{c.updated}</span><span className="notification-marker"/></button>)}</div></section></div>}
          {screen==='reunioes'&&<div className="group-list"><section className="issue-group"><div className="group-title group-title--static"><Video size={15}/><strong>Salas do workspace</strong><span>3 salas</span></div><div className="issue-rows">{[['Reunião de operação','Diária · 09:00','Operação'],['Alinhamento de projetos','Quarta-feira · 14:00','Projetos'],['Atendimento ao cliente','Sob demanda','Clientes']].map(([name,when,team],i)=><div className="issue-row meeting-row" key={name}><span className="meeting-icon"><Video size={17}/></span><span className="contact-main"><strong>{name}</strong><small>{when}</small></span><span className="tag">{team}</span><button type="button" className="outlined-button join-button" onClick={()=>setToast('Sala demonstrativa: áudio e vídeo serão conectados na próxima etapa.')}>Ver sala</button></div>)}</div></section></div>}
          {screen==='contatos'&&<div className="group-list"><section className="issue-group"><div className="group-title group-title--static"><Users size={15}/><strong>Diretório de pessoas</strong><span>{contacts.length} membros</span></div><div className="issue-rows">{contacts.map(c=><button type="button" className="issue-row contact-row" key={c.id} onClick={()=>openContact(c)}><Avatar initials={c.initials} size="md" online={c.online}/><span className="contact-main"><strong>{c.name}</strong><small>{c.role}</small></span><span className="tag">{c.team}</span><span className="row-age">{c.online?'Disponível':'Ausente'}</span></button>)}</div></section></div>}
          {screen==='clientes'&&<div className="group-list"><section className="issue-group"><div className="group-title group-title--static"><FolderKanban size={15}/><strong>Organizações conectadas</strong><span>2 clientes</span></div><div className="issue-rows">{channels.filter(c=>c.group==='Clientes').map(c=><button type="button" className="issue-row" key={c.id} onClick={()=>openChannel(c)}><span className="meeting-icon"><FolderKanban size={17}/></span><span className="row-code">{c.code}</span><span className="row-name">{c.name}</span><span className="tag">Externo</span><AvatarStack people={c.people}/><span className="row-age">{c.updated}</span></button>)}</div></section></div>}
          {screen==='configuracoes'&&<div className="settings-content"><h1>Configurações do workspace</h1><p>Personalize a aparência da nova interface.</p><div className="settings-card"><div><strong>Modo escuro</strong><span>Alterne entre o visual claro e escuro.</span></div><button type="button" className={'switch '+(dark?'switch--on':'')} role="switch" aria-checked={dark} onClick={()=>setDark(v=>!v)}><span/></button></div><div className="settings-card"><div><strong>Interface compacta</strong><span>Reduz o espaçamento entre os elementos.</span></div><button type="button" className={'switch '+(dense?'switch--on':'')} role="switch" aria-checked={dense} onClick={()=>setDense(v=>!v)}><span/></button></div><div className="settings-note"><ShieldCheck size={17}/> Esta versão apresenta apenas a interface. Contas, permissões e mensagens reais permanecem desconectadas.</div></div>}
        </div>
      </>}
    </main>

    {searchOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSearchOpen(false);}}><div className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar no workspace"><div className="search-field"><Search size={19}/><input autoFocus placeholder="Buscar canais, pessoas e mensagens..." value={search} onChange={e=>setSearch(e.target.value)}/><kbd>ESC</kbd><button type="button" className="icon-button" aria-label="Fechar busca" onClick={()=>setSearchOpen(false)}><X size={17}/></button></div><div className="search-dialog-results"><span className="menu-heading">Canais</span>{searchResults.channels.length?searchResults.channels.map(c=><button type="button" key={c.id} onClick={()=>{openChannel(c);setSearch('');}}><Hash size={16}/><span>{c.name}</span><small>{c.team}</small></button>):<p>Nenhum canal encontrado.</p>}<span className="menu-heading">Pessoas</span>{searchResults.contacts.map(c=><button type="button" key={c.id} onClick={()=>{openContact(c);setSearch('');}}><Avatar initials={c.initials}/><span>{c.name}</span><small>{c.team}</small></button>)}</div><div className="search-hint"><Command size={13}/> Busque e abra um canal ou contato para navegar.</div></div></div>}
    {createOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false);}}><form className="create-dialog" onSubmit={e=>{e.preventDefault();createChannel();}} aria-label="Criar canal"><div className="dialog-heading"><div><h2>Novo canal</h2><p>Crie um espaço para organizar a comunicação da equipe.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={()=>setCreateOpen(false)}><X size={19}/></button></div><label className="form-label" htmlFor="channel-name">Nome do canal</label><div className="field-with-icon"><Hash size={17}/><input id="channel-name" autoFocus required maxLength={65} placeholder="Ex.: planejamento semanal" value={newName} onChange={e=>setNewName(e.target.value)}/></div><label className="form-label">Visibilidade</label><button type="button" className="privacy-choice" onClick={()=>setNewPrivate(v=>!v)}>{newPrivate?<LockKeyhole size={18}/>:<Globe2 size={18}/>}<span><strong>{newPrivate?'Privado':'Público no workspace'}</strong><small>{newPrivate?'Somente membros convidados.':'Visível para os membros da organização.'}</small></span><span className={'radio-dot '+(newPrivate?'radio-dot--selected':'')}/></button><div className="dialog-actions"><button type="button" className="outlined-button" onClick={()=>setCreateOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={!newName.trim()}><Plus size={16}/> Criar canal</button></div><p className="dialog-footnote">O canal será criado somente nesta sessão de demonstração.</p></form></div>}
    {toast&&<div className="toast" role="status"><span>{toast}</span><button type="button" aria-label="Fechar aviso" onClick={()=>setToast('')}><X size={14}/></button></div>}
  </div>;
}
