import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase';

type PublicAttachment={id:string;name?:string;contentType?:string;size?:number};
type PublicPost={id:string;title?:string;text?:string;authorName?:string;createdAt?:string;reactionCount?:number;commentCount?:number;attachments?:PublicAttachment[];sourceName?:string;sourceUrl?:string;sourceImageUrl?:string;sourceImageUrls?:string[]};
type PublicComment={id:string;authorName?:string;text?:string;createdAt?:string;parentCommentId?:string};
type Payload={post:PublicPost;community:{name:string;description?:string};comments:PublicComment[]};

const query=new URLSearchParams(location.search);
const postId=(query.get('post')||'').trim();
const loginMode=query.get('login')==='1';

if(postId&&!loginMode){
  const stop=onAuthStateChanged(auth,user=>{
    stop();
    if(!user)void openPublicPost(postId);
  });
}

async function openPublicPost(id:string){
  installStyle();
  const root=document.createElement('div');
  root.className='uorqui-public-view';
  document.body.appendChild(root);
  document.documentElement.classList.add('uorqui-public-open');
  root.append(stateCard('Uorqui','Carregando publicação…'));

  try{
    const response=await fetch(`/api/public/posts/${encodeURIComponent(id)}`,{headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>null) as Payload|{error?:string}|null;
    if(!response.ok||!data||!('post'in data)){
      root.replaceChildren(stateCard('Publicação indisponível',data&&'error'in data?data.error||'Esta publicação não é pública.':'Esta publicação não é pública.',true));
      return;
    }
    render(root,data);
  }catch{
    root.replaceChildren(stateCard('Não foi possível carregar','Tente novamente em instantes.',true));
  }
}

function render(root:HTMLElement,data:Payload){
  const {post,community}=data;
  document.title=`${post.title||community.name||'Publicação'} · Uorqui`;

  const header=el('header','public-head');
  header.append(el('strong','public-brand','Uorqui'),loginButton());

  const main=el('main','public-main');
  const context=el('div','public-context');
  context.append(el('div','public-mark',initials(community.name)));
  const contextCopy=el('div');
  contextCopy.append(el('strong','',community.name),el('small','','Comunidade pública · somente esta publicação'));
  context.append(contextCopy);

  const card=el('article','public-card');
  const author=el('div','public-author');
  author.append(el('div','public-avatar',initials(post.authorName||'Usuário')));
  const authorCopy=el('div');
  authorCopy.append(el('strong','',post.authorName||'Usuário'),el('small','',date(post.createdAt)));
  author.append(authorCopy);
  card.append(author);
  if(post.title)card.append(el('h1','public-title',post.title));
  if(post.text)card.append(el('p','public-text',post.text));

  const images=unique([...(post.sourceImageUrls||[]),post.sourceImageUrl||'',...(post.attachments||[]).filter(a=>(a.contentType||'').startsWith('image/')).map(a=>`/api/public/media/${encodeURIComponent(a.id)}?post=${encodeURIComponent(post.id)}`)]);
  if(images.length){
    const gallery=el('div',`public-gallery ${images.length===1?'one':''}`);
    for(const src of images.slice(0,4)){
      const img=document.createElement('img');img.src=src;img.alt='';img.loading='eager';gallery.append(img);
    }
    card.append(gallery);
  }

  const files=(post.attachments||[]).filter(a=>!(a.contentType||'').startsWith('image/'));
  if(files.length){
    const list=el('div','public-files');
    for(const file of files.slice(0,8)){
      const link=document.createElement('a');
      link.href=`/api/public/media/${encodeURIComponent(file.id)}?post=${encodeURIComponent(post.id)}`;
      link.target='_blank';link.rel='noopener';link.textContent=file.name||'Arquivo';list.append(link);
    }
    card.append(list);
  }

  if(post.sourceName||post.sourceUrl){
    const source=el('div','public-source',`Fonte: ${post.sourceName||'matéria original'}`);
    if(post.sourceUrl){const link=document.createElement('a');link.href=post.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver fonte';source.append(link);}
    card.append(source);
  }
  card.append(el('div','public-stats',`♥ ${Number(post.reactionCount||0)}   ·   💬 ${Number(post.commentCount||data.comments.length)}`));
  main.append(context,card);

  const comments=(data.comments||[]).filter(item=>(item.text||'').trim());
  if(comments.length){
    const section=el('section','public-comments');section.append(el('h2','','Respostas'));
    for(const comment of comments.slice(0,100)){
      const item=el('article',`public-comment ${comment.parentCommentId?'reply':''}`);
      const top=el('div');top.append(el('strong','',comment.authorName||'Usuário'),el('small','',date(comment.createdAt)));
      item.append(top,el('p','',comment.text||''));section.append(item);
    }
    main.append(section);
  }

  const cta=el('section','public-cta');
  cta.append(el('strong','','Quer participar da conversa?'),el('p','','Entre no Uorqui para responder, curtir, participar da comunidade e descobrir outras publicações.'),loginButton());
  main.append(cta);
  root.replaceChildren(header,main);
}

function loginButton(){const b=el('button','public-login','Entrar ou criar conta') as HTMLButtonElement;b.type='button';b.onclick=()=>{const next=new URL(location.href);next.searchParams.set('post',postId);next.searchParams.set('login','1');location.assign(next.toString());};return b;}
function stateCard(title:string,text:string,withLogin=false){const wrap=el('div','public-state');const card=el('div','public-state-card');card.append(el('strong','public-brand','Uorqui'),el('h2','',title),el('p','',text));if(withLogin)card.append(loginButton());wrap.append(card);return wrap;}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''){const node=document.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;}
function initials(v:string){return v.trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'U';}
function date(v?:string){if(!v)return'';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return'';}}
function unique(values:string[]){return Array.from(new Set(values.map(v=>String(v||'').trim()).filter(v=>/^https?:\/\//i.test(v)||v.startsWith('/api/public/media/'))));}

function installStyle(){
  if(document.querySelector('style[data-public-post]'))return;
  const s=document.createElement('style');s.dataset.publicPost='1';s.textContent=`html.uorqui-public-open,html.uorqui-public-open body{overflow:auto!important;background:#f5f6f7!important}.uorqui-public-view{position:fixed;inset:0;z-index:10000;overflow:auto;background:#f5f6f7;color:#15171b;font-family:Inter,system-ui,sans-serif}.public-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:13px max(14px,calc((100vw - 680px)/2));background:rgba(255,255,255,.96);border-bottom:1px solid #e5e7ea}.public-brand{font-size:20px;font-weight:850}.public-login{border:0;border-radius:10px;background:#15171b;color:#fff;padding:9px 12px;font-size:11px;font-weight:800}.public-main{width:min(680px,100%);margin:auto;padding:15px 10px 45px}.public-context{display:flex;align-items:center;gap:9px;margin:0 3px 9px;font-size:10px;color:#767c84}.public-context strong,.public-context small{display:block}.public-context strong{font-size:12px;color:#292d32}.public-mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#17191d;color:#fff;font-size:9px;font-weight:850}.public-card,.public-comment,.public-cta,.public-state-card{background:#fff;border:1px solid #e3e5e8;border-radius:15px}.public-card{padding:16px}.public-author{display:flex;gap:9px;align-items:center}.public-avatar{width:37px;height:37px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#238df5,#6f3cff 55%,#20c9b5);color:#fff;font-size:9px;font-weight:850}.public-author strong,.public-author small{display:block}.public-author strong{font-size:12px}.public-author small{font-size:9px;color:#878c93}.public-title{font-size:18px;margin:14px 0 7px}.public-text{white-space:pre-wrap;font-size:14px;line-height:1.58;margin:12px 0 0}.public-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-top:13px;overflow:hidden;border-radius:12px}.public-gallery.one{grid-template-columns:1fr}.public-gallery img{width:100%;height:230px;object-fit:cover;background:#eee}.public-gallery.one img{height:auto;max-height:520px;object-fit:contain}.public-files{display:flex;flex-direction:column;gap:6px;margin-top:12px}.public-files a{padding:9px 10px;border:1px solid #e6e8ea;border-radius:10px;color:#34383d;text-decoration:none;font-size:10px}.public-source,.public-stats{margin-top:12px;padding-top:10px;border-top:1px solid #eef0f2;font-size:10px;color:#747a82}.public-source{display:flex;justify-content:space-between}.public-source a{color:#333}.public-comments{margin-top:13px}.public-comments h2{font-size:13px;margin:0 0 8px}.public-comment{padding:11px 12px;margin-bottom:7px}.public-comment.reply{margin-left:20px}.public-comment strong{font-size:10px}.public-comment small{margin-left:7px;font-size:8px;color:#8a8f96}.public-comment p{white-space:pre-wrap;margin:6px 0 0;font-size:12px;line-height:1.5}.public-cta{margin-top:14px;padding:16px;text-align:center}.public-cta strong{display:block;font-size:13px}.public-cta p{font-size:10px;line-height:1.45;color:#767c84}.public-state{min-height:100vh;display:grid;place-items:center;padding:20px}.public-state-card{width:min(420px,100%);padding:24px;text-align:center}.public-state-card h2{font-size:16px}.public-state-card p{font-size:10px;line-height:1.5;color:#767c84}@media(max-width:600px){.public-main{padding:10px 7px 36px}.public-card{padding:14px}.public-gallery img{height:180px}.public-gallery.one img{height:auto}.public-comment.reply{margin-left:12px}}`;
  document.head.append(s);
}
