import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, updateProfile, signOut,
  sendPasswordResetEmail, sendEmailVerification, reload
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const appRoot = $('#app');
const toastEl = $('#toast');
const cfg = window.UORQUI_FIREBASE_CONFIG || {};
const configured = cfg.apiKey && cfg.appId && !String(cfg.apiKey).includes('COLE_AQUI') && !String(cfg.appId).includes('COLE_AQUI');
const apiBase = String(window.UORQUI_API_BASE || '').replace(/\/$/, '');
const apiConfigured = /^https?:\/\//.test(apiBase) && !apiBase.includes('COLE_AQUI');
let auth = null;
let currentUser = null;
let data = null;
let selectedCompanyId = localStorage.getItem('uorqui.companyId') || '';
let currentView = 'home';
let currentTab = 'for-you';
let inviteToken = new URL(location.href).searchParams.get('invite') || sessionStorage.getItem('uorqui.invite') || '';
if (inviteToken) sessionStorage.setItem('uorqui.invite', inviteToken);

function toast(message){
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(()=>toastEl.classList.remove('show'), 2600);
}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function initials(name='U'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'U';}
function relative(iso){
  if(!iso) return '';
  const ms=Date.now()-new Date(iso).getTime(); const m=Math.max(0,Math.floor(ms/60000));
  if(m<1)return 'agora'; if(m<60)return `${m} min`; const h=Math.floor(m/60); if(h<24)return `${h}h`; const d=Math.floor(h/24); if(d<30)return `${d}d`; return new Date(iso).toLocaleDateString('pt-BR');
}
function formatNumber(n=0){return new Intl.NumberFormat('pt-BR',{notation:n>999?'compact':'standard',maximumFractionDigits:1}).format(n);}

async function api(path, options={}){
  if(!currentUser) throw new Error('Sessão encerrada.');
  if(!apiConfigured) throw new Error('A URL da API ainda não foi configurada em public/api-config.js.');
  const token = await currentUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if(options.body && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const res = await fetch(`${apiBase}${path}`, {...options, headers});
  const ct=res.headers.get('content-type')||'';
  const body=ct.includes('application/json') ? await res.json() : await res.text();
  if(!res.ok) throw new Error(body?.error || body || `Erro ${res.status}`);
  return body;
}

function renderAuth(mode='login', message=''){
  const isSignup = mode==='signup';
  appRoot.innerHTML = `
    <div class="auth-shell">
      <section class="auth-art">
        <img src="/assets/uorqui-logo-light.png" alt="Uorqui">
        <div class="auth-copy"><h1>Conversas de trabalho que não se perdem.</h1><p>Troque grupos corporativos dispersos por comunidades privadas, pesquisáveis e ligadas ao conhecimento da sua empresa.</p></div>
        <small class="muted">Uorqui 1.0.0</small>
      </section>
      <section class="auth-form-wrap">
        <form class="auth-card" id="authForm">
          <img src="/assets/uorqui-logo-light.png" alt="Uorqui" style="width:145px;margin-bottom:28px">
          <h2>${isSignup?'Criar sua conta':'Entrar no Uorqui'}</h2>
          <p>${inviteToken?'Você recebeu um convite. Entre ou crie sua conta e nós cuidamos do restante.':isSignup?'Sua conta é sua, mesmo antes de entrar em uma empresa.':'Acesse suas empresas, comunidades e conversas.'}</p>
          ${!configured?'<div class="setup-warning"><strong>Firebase pendente.</strong><br>Preencha <code>public/firebase-config.js</code> com a configuração do Web App do Firebase.</div>':''}${!apiConfigured?'<div class="setup-warning"><strong>API pendente.</strong><br>Depois de publicar o Worker, informe a URL em <code>public/api-config.js</code>.</div>':''}
          ${message?`<div class="setup-warning">${esc(message)}</div>`:''}
          ${isSignup?'<label class="field"><span>Nome</span><input name="name" autocomplete="name" required placeholder="Seu nome"></label>':''}
          <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com"></label>
          <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="••••••••"></label>
          <button class="btn" ${configured?'':'disabled'}>${isSignup?'Criar conta':'Entrar'}</button>
          <div id="authError" class="error"></div>
          ${!isSignup?'<button class="btn ghost" type="button" id="resetPassword">Esqueci minha senha</button>':''}
          <div class="auth-switch">${isSignup?'Já tem conta?':'Ainda não tem conta?'} <button type="button" id="switchAuth">${isSignup?'Entrar':'Criar conta'}</button></div>
        </form>
      </section>
    </div>`;
  $('#switchAuth').onclick=()=>renderAuth(isSignup?'login':'signup');
  const form=$('#authForm');
  form.onsubmit=async e=>{
    e.preventDefault(); if(!configured)return;
    const fd=new FormData(form); const email=String(fd.get('email')).trim(); const pass=String(fd.get('password'));
    const err=$('#authError'); err.textContent='';
    try{
      if(isSignup){
        const cred=await createUserWithEmailAndPassword(auth,email,pass);
        const name=String(fd.get('name')).trim();
        await updateProfile(cred.user,{displayName:name});
        if(!inviteToken) await sendEmailVerification(cred.user).catch(()=>{});
        await cred.user.getIdToken(true);
      }else await signInWithEmailAndPassword(auth,email,pass);
    }catch(ex){err.textContent=friendlyAuthError(ex);}
  };
  if(!isSignup && $('#resetPassword')) $('#resetPassword').onclick=async()=>{
    const email=String(new FormData(form).get('email')||'').trim();
    if(!email){$('#authError').textContent='Digite seu e-mail primeiro.';return;}
    try{await sendPasswordResetEmail(auth,email);toast('E-mail de recuperação enviado.');}catch(ex){$('#authError').textContent=friendlyAuthError(ex);}
  };
}
function friendlyAuthError(ex){
  const c=ex?.code||'';
  if(c.includes('invalid-credential'))return 'E-mail ou senha inválidos.';
  if(c.includes('email-already-in-use'))return 'Este e-mail já possui uma conta.';
  if(c.includes('weak-password'))return 'Use uma senha mais forte.';
  if(c.includes('too-many-requests'))return 'Muitas tentativas. Tente novamente mais tarde.';
  return ex?.message || 'Não foi possível continuar.';
}

async function loadBootstrap(){
  const q=selectedCompanyId?`?companyId=${encodeURIComponent(selectedCompanyId)}`:'';
  data=await api(`/bootstrap${q}`);
  if(data.selectedCompanyId && data.selectedCompanyId!==selectedCompanyId){selectedCompanyId=data.selectedCompanyId;localStorage.setItem('uorqui.companyId',selectedCompanyId);}
  if(inviteToken){
    try{
      await api('/invites/accept',{method:'POST',body:JSON.stringify({token:inviteToken})});
      sessionStorage.removeItem('uorqui.invite'); inviteToken=''; history.replaceState({},'',location.pathname);
      data=await api('/bootstrap');
      selectedCompanyId=data.selectedCompanyId||'';
      if(selectedCompanyId)localStorage.setItem('uorqui.companyId',selectedCompanyId);
      toast('Convite aceito. Bem-vindo!');
    }catch(ex){ if(!String(ex.message).includes('já foi')) toast(ex.message); }
  }
  renderApp();
}

function renderApp(){
  const me=data.me||{}; const companies=data.companies||[]; const company=data.company||null; const notifications=data.notifications||[];
  const unread=notifications.filter(n=>!n.read).length;
  appRoot.innerHTML=`
    <div class="app-shell">
      <aside class="sidebar">
        <button class="brand" data-view="home"><img src="/assets/uorqui-logo-light.png" alt="Uorqui"></button>
        ${companies.length?`<div class="company-select"><span class="company-mark">${esc(initials(company?.name||'U'))}</span><select id="companySelect">${companies.map(c=>`<option value="${c.id}" ${c.id===selectedCompanyId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}
        <nav class="nav">
          <button data-view="home" class="active"><span class="nav-icon">⌂</span><span>Início</span></button>
          <button data-view="communities"><span class="nav-icon">◎</span><span>Comunidades</span></button>
          <button data-view="search"><span class="nav-icon">⌕</span><span>Buscar</span></button>
          <button data-action="notifications"><span class="nav-icon">♢</span><span>Notificações</span>${unread?`<b class="pill-count">${unread}</b>`:''}</button>
          ${data.canAdmin?'<button data-view="admin"><span class="nav-icon">⚙</span><span>Administrar</span></button>':''}
          <button data-view="profile"><span class="nav-icon">○</span><span>Perfil</span></button>
        </nav>
        <button class="btn compose-main" data-action="compose">+ Publicar</button>
        <div class="sidebar-bottom"><div class="me-card"><div class="avatar">${esc(initials(me.displayName||me.email))}</div><div class="meta"><strong>${esc(me.displayName||'Usuário')}</strong><small>${esc(me.email||'')}</small></div><button class="btn ghost small" data-action="logout">Sair</button></div></div>
      </aside>
      <main class="main">
        <header class="topbar"><div class="topbar-row"><h1 id="pageTitle">Início</h1><div class="top-actions"><button class="icon-btn" data-action="notifications">♢</button></div></div><div class="tabs" id="homeTabs"><button data-tab="for-you" class="active">Para você</button><button data-tab="recent">Recentes</button><button data-tab="announcement">Comunicados</button><button data-tab="world">Mundo</button></div></header>
        <section class="quick-compose" id="quickCompose"><div class="avatar">${esc(initials(me.displayName||me.email))}</div><button data-action="compose">Compartilhe algo com sua empresa ou comunidade…</button></section>
        <section id="content" class="feed"></section>
      </main>
      <aside class="rightbar">
        <form class="searchbox" id="sideSearch"><input class="search-input" name="q" placeholder="Buscar conversas e soluções"></form>
        ${company?`<section class="side-card"><h3>${esc(company.name)}</h3><small class="muted">${data.role==='owner'?'Proprietário':data.role==='admin'?'Administrador':'Colaborador'}</small></section>`:''}
        <section class="side-card"><h3>Suas comunidades</h3><div class="community-list">${(data.communities||[]).slice(0,6).map(c=>communityRow(c)).join('') || '<small class="muted">Nenhuma comunidade ainda.</small>'}</div><button class="side-link" data-view="communities">Ver todas</button></section>
        <section class="side-card"><h3>Uorqui 1.0.0</h3><small class="muted">Empresa → comunidades → conversas → conhecimento.</small></section>
      </aside>
    </div>
    <nav class="mobile-nav"><button data-view="home" class="active">⌂</button><button data-view="communities">◎</button><button class="create" data-action="compose">+</button><button data-action="notifications">♢</button><button data-view="profile">○</button></nav>
    <div class="panel-scrim" id="panelScrim"></div><aside class="panel" id="notificationPanel"><div class="panel-head"><h2>Notificações</h2><button class="icon-btn" data-action="close-panel">×</button></div><div class="panel-body" id="notificationBody"></div></aside>
    <div id="modalRoot"></div>`;
  bindShell(); showView(currentView);
}
function communityRow(c){return `<button class="community-row" data-community="${c.id}"><div class="avatar">${esc(initials(c.name))}</div><div class="meta"><strong>${esc(c.name)}</strong><small>${esc(c.description||'Comunidade privada')}</small></div></button>`;}

function bindShell(){
  $$('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  $$('[data-action="notifications"]').forEach(b=>b.onclick=openNotifications);
  $$('[data-action="compose"]').forEach(b=>b.onclick=openComposer);
  $$('[data-action="logout"]').forEach(b=>b.onclick=()=>signOut(auth));
  $$('[data-action="close-panel"]').forEach(b=>b.onclick=closeNotifications);
  $('#panelScrim').onclick=closeNotifications;
  if($('#companySelect')) $('#companySelect').onchange=async e=>{selectedCompanyId=e.target.value;localStorage.setItem('uorqui.companyId',selectedCompanyId);await loadBootstrap();};
  $$('#homeTabs [data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;$$('#homeTabs [data-tab]').forEach(x=>x.classList.toggle('active',x===b));renderFeed();});
  $('#sideSearch').onsubmit=e=>{e.preventDefault();showView('search');setTimeout(()=>{const i=$('#mainSearch');if(i){i.value=new FormData(e.target).get('q');runSearch(i.value)}},0)};
  $$('.community-row').forEach(b=>b.onclick=()=>showCommunity(b.dataset.community));
}

function showView(view){
  currentView=view; const title=$('#pageTitle'); const tabs=$('#homeTabs'); const quick=$('#quickCompose');
  $$('.nav [data-view],.mobile-nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  tabs.classList.toggle('hidden',view!=='home'); quick.classList.toggle('hidden',view!=='home');
  if(view==='home'){title.textContent=data.company?'Início':'Uorqui';renderFeed();}
  else if(view==='communities'){title.textContent='Comunidades';renderCommunities();}
  else if(view==='search'){title.textContent='Buscar';renderSearch();}
  else if(view==='admin'){title.textContent='Administrar';renderAdmin();}
  else if(view==='profile'){title.textContent='Perfil';renderProfile();}
}
function renderFeed(){
  const content=$('#content'); let posts=[...(data.posts||[])];
  if(currentTab==='world') posts=[...(data.worldPosts||[])];
  else if(currentTab==='announcement') posts=posts.filter(p=>p.type==='announcement');
  if(currentTab==='recent') posts.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if(!data.company && currentTab!=='world'){
    content.innerHTML=`<div class="empty"><h2>Sua conta Uorqui está pronta.</h2><p>Você ainda não participa de nenhuma empresa. Crie uma empresa para testar ou aguarde um convite enviado ao seu e-mail.</p><button class="btn" data-action="create-company">Criar uma empresa</button><button class="btn secondary" style="margin-left:8px" data-tab-jump="world">Ver Mundo</button></div>`;
    $('[data-action="create-company"]')?.addEventListener('click',openCreateCompany);
    $('[data-tab-jump="world"]')?.addEventListener('click',()=>{currentTab='world';$$('#homeTabs [data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab==='world'));renderFeed();});
    return;
  }
  content.innerHTML=posts.length?posts.map(postCard).join(''):`<div class="empty"><h2>Nada por aqui ainda.</h2><p>${currentTab==='world'?'As publicações públicas aparecerão aqui.':'Publique a primeira conversa ou comunicado.'}</p><button class="btn" data-action="compose">Publicar</button></div>`;
  bindPostActions();
}
function postCard(p){
  const c=data.communityMap?.[p.communityId];
  const scopeLabel=p.scope==='world'?'🌎 Mundo':p.scope==='community'?`◎ ${c?.name||p.communityName||'Comunidade'}`:`🏢 ${data.company?.name||p.companyName||'Empresa'}`;
  const att=(p.attachments||[]);
  return `<article class="card post" data-post-id="${p.id}"><header class="post-head"><div class="avatar">${esc(initials(p.authorName||'U'))}</div><div class="post-author"><div><strong>${esc(p.authorName||'Usuário')}</strong> <span>· ${esc(relative(p.createdAt))}</span></div><div class="scope ${p.scope}">${esc(scopeLabel)}</div></div></header><div class="post-body">${p.type==='announcement'?`<div class="announcement-box"><small>📢 COMUNICADO${p.requiresReadReceipt?' · LEITURA SOLICITADA':''}</small><strong>${esc(p.title||'Comunicado')}</strong><p>${esc(p.text)}</p>${p.requiresReadReceipt?`<button class="btn small ${p.hasRead?'secondary':''}" data-read="${p.id}" ${p.hasRead?'disabled':''}>${p.hasRead?'✓ Leitura confirmada':'Confirmar leitura'}</button>`:''}</div>`:p.type==='question'?`<div class="question-box"><small>PERGUNTA</small><p>${esc(p.text)}</p>${p.acceptedCommentId?'<span class="solution">✓ Solução encontrada</span>':''}</div>`:`<p>${esc(p.text).replace(/\n/g,'<br>')}</p>`}${att.length?`<div class="attachment-grid ${att.length===1?'one':''}">${att.map(a=>`<div class="attachment" data-media="${a.id}" data-type="${esc(a.contentType||'')}"><span>Carregando arquivo…</span></div>`).join('')}</div>`:''}</div><footer class="post-actions"><button data-like="${p.id}">${p.liked?'♥':'♡'} <span>${formatNumber(p.reactionCount||0)}</span></button><button data-comments="${p.id}">▢ <span>${formatNumber(p.commentCount||0)} respostas</span></button>${p.scope!=='world'?'<button>⌁</button>':''}<span class="spacer"></span></footer></article>`;
}
function bindPostActions(){
  $$('[data-like]').forEach(b=>b.onclick=async()=>{try{await api(`/posts/${b.dataset.like}/reaction`,{method:'POST'});await refreshData(false);}catch(ex){toast(ex.message)}});
  $$('[data-comments]').forEach(b=>b.onclick=()=>openComments(b.dataset.comments));
  $$('[data-read]').forEach(b=>b.onclick=async()=>{try{await api(`/posts/${b.dataset.read}/read`,{method:'POST'});toast('Leitura confirmada.');await refreshData(false);}catch(ex){toast(ex.message)}});
  $$('[data-media]').forEach(loadMediaElement);
  $$('[data-action="compose"]').forEach(b=>b.onclick=openComposer);
}
async function loadMediaElement(el){
  try{
    const token=await currentUser.getIdToken(); if(!apiConfigured) throw new Error(); const res=await fetch(`${apiBase}/media/${el.dataset.media}`,{headers:{Authorization:`Bearer ${token}`}});
    if(!res.ok)throw new Error(); const blob=await res.blob(); const url=URL.createObjectURL(blob);
    if((el.dataset.type||'').startsWith('image/'))el.innerHTML=`<img src="${url}" alt="Anexo">`;
    else {el.classList.add('file');el.innerHTML=`<a href="${url}" download>Baixar anexo</a>`;}
  }catch{el.textContent='Arquivo indisponível';}
}

async function refreshData(render=true){
  const q=selectedCompanyId?`?companyId=${encodeURIComponent(selectedCompanyId)}`:''; data=await api(`/bootstrap${q}`); if(render)renderApp(); else renderFeed();
}

function renderCommunities(){
  const content=$('#content'); const list=data.communities||[];
  content.innerHTML=`<div class="section"><h2>Suas comunidades</h2><p>Comunidades privadas substituem os grupos de WhatsApp da empresa. O acesso é controlado pela empresa.</p>${list.length?`<div class="admin-grid">${list.map(c=>`<button class="admin-card community-row" data-community="${c.id}"><div class="avatar">${esc(initials(c.name))}</div><div class="meta"><strong>${esc(c.name)}</strong><small>${esc(c.description||'Comunidade privada')}</small></div></button>`).join('')}</div>`:'<div class="empty"><p>Você ainda não participa de comunidades.</p></div>'}</div>`;
  $$('.community-row').forEach(b=>b.onclick=()=>showCommunity(b.dataset.community));
}
async function showCommunity(id){
  const c=(data.communities||[]).find(x=>x.id===id); if(!c)return;
  currentView='communities'; $('#pageTitle').textContent=c.name; $('#homeTabs').classList.add('hidden'); $('#quickCompose').classList.add('hidden');
  const posts=(data.posts||[]).filter(p=>p.communityId===id);
  $('#content').innerHTML=`<div class="section"><h2>${esc(c.name)}</h2><p>${esc(c.description||'Comunidade privada da empresa.')}</p><button class="btn small" data-compose-community="${id}">+ Publicar nesta comunidade</button></div><div class="feed" style="padding-top:0">${posts.length?posts.map(postCard).join(''):'<div class="empty"><p>Ainda não há conversas nesta comunidade.</p></div>'}</div>`;
  $('[data-compose-community]')?.addEventListener('click',()=>openComposer('community',id)); bindPostActions();
}

function renderSearch(){
  $('#content').innerHTML=`<div class="section"><h2>Encontre conversas antigas</h2><p>Busque no conteúdo que você tem permissão para acessar.</p><form id="searchForm" class="searchbox"><input id="mainSearch" class="search-input" placeholder="Ex.: erro 37, procedimento, treinamento…"><button class="btn">Buscar</button></form><div id="searchResults" style="margin-top:14px"></div></div>`;
  $('#searchForm').onsubmit=e=>{e.preventDefault();runSearch($('#mainSearch').value)};
}
async function runSearch(q){
  if(!q?.trim())return; const box=$('#searchResults');box.innerHTML='<div class="muted">Buscando…</div>';
  try{const r=await api(`/search?q=${encodeURIComponent(q)}${selectedCompanyId?`&companyId=${encodeURIComponent(selectedCompanyId)}`:''}`);box.innerHTML=r.posts.length?r.posts.map(p=>`<button class="search-result" data-result-post="${p.id}" style="width:100%;text-align:left;background:#fff"><strong>${esc(p.type==='question'?'Pergunta':p.type==='announcement'?'Comunicado':'Publicação')}</strong><p>${esc(p.text||p.title||'')}</p><small>${esc(p.authorName||'')} · ${esc(relative(p.createdAt))}</small></button>`).join(''):'<div class="empty"><p>Nenhum resultado encontrado.</p></div>';}
  catch(ex){box.innerHTML=`<div class="error">${esc(ex.message)}</div>`}
}

function renderProfile(){
  const me=data.me||{}; const verified=currentUser?.emailVerified;
  $('#content').innerHTML=`<div class="section"><div class="card" style="padding:20px"><div style="display:flex;gap:14px;align-items:center"><div class="avatar" style="width:64px;height:64px;font-size:18px">${esc(initials(me.displayName||me.email))}</div><div><h2 style="margin:0">${esc(me.displayName||'Usuário')}</h2><p class="muted" style="margin:4px 0">${esc(me.email||'')}</p><span class="badge">${verified?'E-mail verificado':'E-mail não verificado'}</span></div></div><p class="muted">Sua conta pertence a você. Empresas e comunidades são espaços privados aos quais você recebe acesso.</p>${verified?'':`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><button class="btn secondary" id="sendVerify">Enviar verificação</button><button class="btn secondary" id="checkVerify">Já verifiquei</button></div>`}<button class="btn secondary" data-action="logout">Sair da conta</button></div></div>`;
  $('[data-action="logout"]').onclick=()=>signOut(auth);
  if($('#sendVerify')) $('#sendVerify').onclick=async()=>{try{await sendEmailVerification(currentUser);toast('E-mail de verificação enviado.')}catch(ex){toast(ex.message)}};
  if($('#checkVerify')) $('#checkVerify').onclick=async()=>{try{await reload(currentUser);await currentUser.getIdToken(true);toast(currentUser.emailVerified?'E-mail verificado.':'A verificação ainda não apareceu.');renderProfile()}catch(ex){toast(ex.message)}};
}

function renderAdmin(){
  if(!data.canAdmin){$('#content').innerHTML='<div class="empty"><h2>Acesso restrito</h2><p>Somente administradores podem acessar esta área.</p></div>';return;}
  const members=data.members||[]; const communities=data.allCompanyCommunities||data.communities||[];
  $('#content').innerHTML=`<div class="section"><h2>Administrar ${esc(data.company?.name||'empresa')}</h2><p>Convide colaboradores, crie comunidades e controle os espaços privados.</p><div class="admin-grid"><form class="admin-card" id="inviteCompanyForm"><h3>Convidar colaborador</h3><label class="field"><span>E-mail</span><input type="email" name="email" required placeholder="pessoa@empresa.com"></label><button class="btn small">Enviar convite</button><div class="error" data-error></div></form><form class="admin-card" id="createCommunityForm"><h3>Criar comunidade</h3><label class="field"><span>Nome</span><input name="name" required placeholder="Ex.: Assistência Técnica"></label><label class="field"><span>Descrição</span><input name="description" placeholder="Assuntos desta comunidade"></label><button class="btn small">Criar comunidade</button><div class="error" data-error></div></form></div><div class="admin-card" style="margin-top:12px"><h3>Colaboradores</h3><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th></th></tr></thead><tbody>${members.map(m=>`<tr><td>${esc(m.displayName||'')}</td><td>${esc(m.email||'')}</td><td><span class="badge">${esc(m.role||'member')}</span></td><td>${m.uid!==currentUser.uid?`<button class="btn secondary small" data-community-invite-user="${m.uid}" data-email="${esc(m.email||'')}">Convidar para comunidade</button>`:''}</td></tr>`).join('')}</tbody></table></div><div class="admin-card" style="margin-top:12px"><h3>Comunidades da empresa</h3>${communities.map(c=>`<div class="community-row"><div class="avatar">${esc(initials(c.name))}</div><div class="meta"><strong>${esc(c.name)}</strong><small>${esc(c.description||'')}</small></div><span class="badge">${c.isDefault?'automática':'por convite'}</span></div>`).join('')}</div></div>`;
  $('#inviteCompanyForm').onsubmit=async e=>{e.preventDefault();const err=$('[data-error]',e.currentTarget);try{const r=await api(`/companies/${selectedCompanyId}/invites`,{method:'POST',body:JSON.stringify({email:new FormData(e.currentTarget).get('email')})});e.currentTarget.reset();toast(r.emailSent?'Convite enviado por e-mail.':'Convite criado. Copie o link exibido.'); if(!r.emailSent) showInviteLink(r.inviteUrl);}catch(ex){err.textContent=ex.message}};
  $('#createCommunityForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),err=$('[data-error]',e.currentTarget);try{await api(`/companies/${selectedCompanyId}/communities`,{method:'POST',body:JSON.stringify({name:fd.get('name'),description:fd.get('description')})});toast('Comunidade criada.');await loadBootstrap();showView('admin')}catch(ex){err.textContent=ex.message}};
  $$('[data-community-invite-user]').forEach(b=>b.onclick=()=>openCommunityInvite(b.dataset.communityInviteUser,b.dataset.email));
}

function showInviteLink(url){
  openModal('Link do convite',`<p class="muted">O envio de e-mail ainda não está configurado. Você pode copiar este link agora:</p><label class="field"><span>Link</span><input id="inviteLink" readonly value="${esc(url)}"></label><button class="btn" id="copyInvite">Copiar link</button>`);
  $('#copyInvite').onclick=async()=>{await navigator.clipboard.writeText($('#inviteLink').value);toast('Link copiado.');};
}
function openCommunityInvite(uid,email){
  const options=(data.allCompanyCommunities||data.communities||[]).filter(c=>!c.isDefault).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  openModal('Convidar para comunidade',`<p class="muted">${esc(email)}</p><label class="field"><span>Comunidade</span><select id="inviteCommunitySelect">${options}</select></label><button class="btn" id="sendCommunityInvite">Enviar convite</button>`);
  $('#sendCommunityInvite').onclick=async()=>{try{const cid=$('#inviteCommunitySelect').value;await api(`/communities/${cid}/invites`,{method:'POST',body:JSON.stringify({uid})});closeModal();toast('Convite enviado pela Central de Notificações.')}catch(ex){toast(ex.message)}};
}

function openNotifications(){
  const panel=$('#notificationPanel'),scrim=$('#panelScrim'),body=$('#notificationBody'); if(!panel)return;
  const ns=data.notifications||[]; body.innerHTML=ns.length?ns.map(n=>`<div class="notification ${n.read?'':'unread'}" data-notification="${n.id}"><strong>${esc(n.title)}</strong><p>${esc(n.body||'')}</p>${n.type?.includes('invite')&&n.status!=='accepted'?`<div class="notification-actions"><button class="btn small" data-accept-invite="${n.data?.inviteId||''}">Aceitar</button><button class="btn secondary small" data-mark-read="${n.id}">Depois</button></div>`:`<button class="btn secondary small" data-mark-read="${n.id}">Marcar como lida</button>`}</div>`).join(''):'<div class="empty"><p>Nenhuma notificação.</p></div>';
  panel.classList.add('open');scrim.classList.add('open');
  $$('[data-mark-read]',body).forEach(b=>b.onclick=async()=>{await api(`/notifications/${b.dataset.markRead}/read`,{method:'POST'});await refreshData(true);openNotifications();});
  $$('[data-accept-invite]',body).forEach(b=>b.onclick=async()=>{try{await api('/invites/accept',{method:'POST',body:JSON.stringify({inviteId:b.dataset.acceptInvite})});closeNotifications();toast('Convite aceito.');await loadBootstrap();}catch(ex){toast(ex.message)}});
}
function closeNotifications(){$('#notificationPanel')?.classList.remove('open');$('#panelScrim')?.classList.remove('open');}

function openModal(title,html){
  $('#modalRoot').innerHTML=`<div class="modal-wrap" id="modalWrap"><div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close-modal>×</button></div><div class="modal-body">${html}</div></div></div>`;
  $('[data-close-modal]').onclick=closeModal; $('#modalWrap').onclick=e=>{if(e.target.id==='modalWrap')closeModal()};
}
function closeModal(){if($('#modalRoot'))$('#modalRoot').innerHTML='';}

function openCreateCompany(){
  openModal('Criar empresa',`<form id="createCompanyForm"><label class="field"><span>Nome da empresa</span><input name="name" required placeholder="Minha Empresa"></label><button class="btn">Criar empresa</button><div class="error" id="createCompanyError"></div></form>`);
  $('#createCompanyForm').onsubmit=async e=>{e.preventDefault();try{const r=await api('/companies',{method:'POST',body:JSON.stringify({name:new FormData(e.currentTarget).get('name')})});selectedCompanyId=r.company.id;localStorage.setItem('uorqui.companyId',selectedCompanyId);closeModal();await loadBootstrap();}catch(ex){$('#createCompanyError').textContent=ex.message}};
}

function openComposer(initialAudience='company',initialCommunityId=''){
  if(!data.company && initialAudience!=='world'){initialAudience='world';}
  const comms=data.communities||[];
  openModal('Criar publicação',`<div class="audience-grid"><button class="audience ${initialAudience==='company'?'active':''}" data-audience="company" ${data.company?'':'disabled'}><strong>🏢 Empresa</strong><small>Todos da empresa</small></button><button class="audience ${initialAudience==='community'?'active':''}" data-audience="community" ${comms.length?'':'disabled'}><strong>◎ Comunidade</strong><small>Membros do grupo</small></button><button class="audience ${initialAudience==='world'?'active':''}" data-audience="world"><strong>🌎 Mundo</strong><small>Público no Uorqui</small></button></div><label class="field ${initialAudience==='community'?'':'hidden'}" id="communityPicker"><span>Comunidade</span><select id="composerCommunity">${comms.map(c=>`<option value="${c.id}" ${c.id===initialCommunityId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field"><span>Tipo</span><select id="composerType"><option value="post">Publicação</option><option value="question">Pergunta</option>${data.canAdmin&&data.company?'<option value="announcement">Comunicado oficial</option>':''}</select></label><label class="field hidden" id="titleField"><span>Título do comunicado</span><input id="composerTitle" placeholder="Título"></label><label class="field hidden" id="receiptField"><span><input type="checkbox" id="requiresRead"> Solicitar confirmação de leitura</span></label><textarea class="composer-text" id="composerText" maxlength="5000" placeholder="O que precisa ser compartilhado?"></textarea><div class="composer-tools"><label class="file-picker">📎 Anexar<input id="composerFile" type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"></label><span class="selected-file" id="selectedFile">Nenhum arquivo</span><button class="btn" id="publishPost">Publicar</button></div><div class="error" id="composerError"></div>`);
  let audience=initialAudience;
  $$('[data-audience]').forEach(b=>b.onclick=()=>{if(b.disabled)return;audience=b.dataset.audience;$$('[data-audience]').forEach(x=>x.classList.toggle('active',x===b));$('#communityPicker').classList.toggle('hidden',audience!=='community')});
  $('#composerType').onchange=e=>{const ann=e.target.value==='announcement';$('#titleField').classList.toggle('hidden',!ann);$('#receiptField').classList.toggle('hidden',!ann)};
  $('#composerFile').onchange=e=>$('#selectedFile').textContent=e.target.files?.[0]?.name||'Nenhum arquivo';
  $('#publishPost').onclick=async()=>{
    const text=$('#composerText').value.trim(),type=$('#composerType').value,err=$('#composerError'); if(!text){err.textContent='Escreva alguma coisa.';return;}
    const btn=$('#publishPost');btn.disabled=true;btn.textContent='Publicando…';
    try{
      let attachmentIds=[]; const file=$('#composerFile').files?.[0];
      const communityId=audience==='community'?$('#composerCommunity').value:null;
      if(file){
        const qs=new URLSearchParams({scope:audience,name:file.name}); if(selectedCompanyId)qs.set('companyId',selectedCompanyId); if(communityId)qs.set('communityId',communityId);
        const up=await api(`/media/upload?${qs}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':file.name},body:file}); attachmentIds=[up.media.id];
      }
      await api('/posts',{method:'POST',body:JSON.stringify({scope:audience,companyId:audience==='world'?null:selectedCompanyId,communityId,type,text,title:type==='announcement'?$('#composerTitle').value.trim():null,requiresReadReceipt:type==='announcement'?$('#requiresRead').checked:false,attachmentIds})});
      closeModal();toast('Publicado.');await loadBootstrap();
    }catch(ex){err.textContent=ex.message;btn.disabled=false;btn.textContent='Publicar';}
  };
}

async function openComments(postId){
  openModal('Respostas','<div id="commentsBox" class="muted">Carregando…</div>');
  try{
    const r=await api(`/posts/${postId}/comments`); const post=r.post;
    $('#commentsBox').innerHTML=`<div>${r.comments.map(c=>`<div class="notification"><strong>${esc(c.authorName)}</strong><p>${esc(c.text)}</p><small class="muted">${esc(relative(c.createdAt))}</small>${post.type==='question'&&post.authorUid===currentUser.uid&&!post.acceptedCommentId?`<div><button class="btn secondary small" data-solution="${c.id}">✓ Marcar como solução</button></div>`:''}</div>`).join('')||'<p class="muted">Nenhuma resposta ainda.</p>'}</div><form id="commentForm"><label class="field"><span>Responder</span><textarea name="text" required placeholder="Escreva uma resposta"></textarea></label><button class="btn">Responder</button></form>`;
    $('#commentForm').onsubmit=async e=>{e.preventDefault();try{await api(`/posts/${postId}/comments`,{method:'POST',body:JSON.stringify({text:new FormData(e.currentTarget).get('text')})});closeModal();toast('Resposta publicada.');await refreshData(false)}catch(ex){toast(ex.message)}};
    $$('[data-solution]').forEach(b=>b.onclick=async()=>{try{await api(`/posts/${postId}/solution`,{method:'POST',body:JSON.stringify({commentId:b.dataset.solution})});closeModal();toast('Solução marcada.');await refreshData(false)}catch(ex){toast(ex.message)}});
  }catch(ex){$('#commentsBox').innerHTML=`<div class="error">${esc(ex.message)}</div>`}
}

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

if(!configured){renderAuth('login');}
else{
  const fbApp=initializeApp(cfg); auth=getAuth(fbApp);
  onAuthStateChanged(auth, async user=>{
    currentUser=user;
    if(!user){data=null;renderAuth('login');return;}
    appRoot.innerHTML='<div class="boot"><img src="/assets/uorqui-logo-light.png" alt="Uorqui"><span>Carregando sua empresa…</span></div>';
    try{await loadBootstrap();}catch(ex){appRoot.innerHTML=`<div class="empty"><h2>Não foi possível abrir o Uorqui.</h2><p>${esc(ex.message)}</p><button class="btn" id="retry">Tentar novamente</button><button class="btn secondary" id="logoutFail">Sair</button></div>`;$('#retry').onclick=loadBootstrap;$('#logoutFail').onclick=()=>signOut(auth);}
  });
}
