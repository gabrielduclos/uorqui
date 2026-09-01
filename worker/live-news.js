import apiCore, { RealtimeHub } from './ai-news-compat.js';
import scheduledCore from './official-hotfix.js';

export { RealtimeHub };

const EDITORIAL_STATE_ID = 'uorqui_ai_live_news_state_v1';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SEMANTIC_WINDOW = 72 * 60 * 60 * 1000;
const FRESH_NEWS_WINDOW = 36 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_AGENT = 10;
let googleTokenCache = { expires: 0, token: '' };

const AGENTS = [
  { key:'tecnologia-ia', name:'Tecnologia & IA', agent:'Nina · Tecnologia', query:'tecnologia inteligência artificial segurança digital Brasil' },
  { key:'games', name:'Games', agent:'Leo · Games', query:'games jogos videogames lançamento indústria' },
  { key:'motos', name:'Motos', agent:'Rafa · Motos', query:'motos motociclismo motocicletas Brasil' },
  { key:'carros', name:'Carros', agent:'Caio · Carros', query:'carros automóveis indústria automotiva Brasil' },
  { key:'financas', name:'Finanças', agent:'Clara · Finanças', query:'finanças economia juros bancos Brasil' },
  { key:'carreira', name:'Carreira & Trabalho', agent:'Bia · Carreira', query:'empregos carreira mercado de trabalho Brasil' },
  { key:'esportes', name:'Esportes', agent:'Gui · Esportes', query:'futebol esportes Brasil campeonato seleção' },
  { key:'filmes-series', name:'Filmes & Séries', agent:'Luna · Cinema', query:'cinema filmes séries streaming Brasil' },
  { key:'ciencia', name:'Ciência & Curiosidades', agent:'Theo · Ciência', query:'ciência pesquisa descoberta espaço saúde tecnologia' },
  { key:'viagens', name:'Viagens', agent:'Maya · Viagens', query:'viagens turismo destinos aviação Brasil' }
];

const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','sobre','que','se','ao','aos','à','às','mais','menos','novo','nova','novos','novas','após','antes','como','contra','entre','até','já','ainda','pode','podem','vai','vão','tem','ter','foi','ser','são','é','esta','este','essa','esse','isso','sua','seu','suas','seus','notícia','noticias','notícias','veja','saiba','entenda','diz','dizem','segundo','hoje'
]);

export default {
  async fetch(request, env, ctx) {
    return apiCore.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const scheduledAt = Number(controller?.scheduledTime || Date.now());
    const minute = new Date(scheduledAt).getUTCMinutes();

    if (minute === 0 && typeof scheduledCore.scheduled === 'function') {
      try {
        scheduledCore.scheduled(controller, suppressLegacyNewsAi(env), ctx);
      } catch (error) {
        console.error('Uorqui hourly scheduled tasks failed:', error?.message || error);
      }
    }

    ctx.waitUntil(runLiveNewsCycle(env).catch(error => {
      console.error('Uorqui live news cycle failed:', error?.message || error);
    }));
  }
};

function suppressLegacyNewsAi(env) {
  if (!env?.AI) return env;
  const originalAi = env.AI;
  const wrappedAi = Object.create(originalAi);
  wrappedAi.run = async (model, input) => {
    const prompt = promptText(input);
    if (/MANCHETE:\s*/i.test(prompt) && /FONTE:\s*/i.test(prompt)) {
      throw new Error('Publicação automática controlada pelo editor de notícias de 15 minutos.');
    }
    return originalAi.run.call(originalAi, model, input);
  };
  const wrappedEnv = Object.create(env);
  Object.defineProperty(wrappedEnv, 'AI', { value: wrappedAi, enumerable: true });
  return wrappedEnv;
}

async function runLiveNewsCycle(env) {
  const now = Date.now();
  const state = await loadEditorialState(env, now);
  const diagnostics = [];
  let published = 0;

  for (const agent of AGENTS) {
    const diagnostic = { agent: agent.key, candidates: 0, attempted: 0, duplicates: 0, result: 'none' };
    try {
      const candidates = await findFreshCandidates(agent, state, now);
      diagnostic.candidates = candidates.length;

      if (!candidates.length) {
        diagnostic.result = 'no-fresh-candidate';
        diagnostics.push(diagnostic);
        console.info('Live news skipped:', diagnostic);
        continue;
      }

      let post = null;
      for (const candidate of candidates.slice(0, MAX_CANDIDATES_PER_AGENT)) {
        diagnostic.attempted += 1;
        const enriched = await enrichArticle(candidate);
        if (isDuplicateNews(enriched, state.items, now)) {
          diagnostic.duplicates += 1;
          continue;
        }

        const text = await generateNewsText(env, agent, enriched);
        if (!text) {
          diagnostic.result = 'empty-text';
          continue;
        }

        post = await publishNewsPost(env, agent, enriched, text, now);
        if (!post) {
          diagnostic.result = 'missing-agent-or-community';
          break;
        }

        rememberNews(state, enriched, post.createdAt);
        await saveEditorialState(env, state, post.createdAt);
        await notifyCommunityMembers(env, post).catch(error => {
          console.warn('Live news notifications failed:', agent.key, error?.message || error);
        });
        published += 1;
        diagnostic.result = 'published';
        diagnostic.postId = post.id;
        break;
      }

      if (!post && diagnostic.result === 'none') {
        diagnostic.result = diagnostic.duplicates >= diagnostic.attempted ? 'all-duplicates' : 'no-publishable-candidate';
      }
      diagnostics.push(diagnostic);
      console.info('Live news agent result:', diagnostic);
    } catch (error) {
      diagnostic.result = 'error';
      diagnostic.error = String(error?.message || error);
      diagnostics.push(diagnostic);
      console.warn('Live news agent failed:', agent.key, error?.message || error);
    }
  }

  state.items = pruneStateItems(state.items, Date.now());
  state.lastRunAt = new Date().toISOString();
  state.lastCycle = { published, checked: AGENTS.length, diagnostics };
  if (published) state.lastPublishedAt = new Date().toISOString();
  await saveEditorialState(env, state, state.lastRunAt);
  console.log('Uorqui live news cycle complete', { published, checked: AGENTS.length, diagnostics });
}

async function loadEditorialState(env, now) {
  const existing = await fsGet(env, 'systemConfig', EDITORIAL_STATE_ID).catch(() => null);
  if (existing?.initialized && Array.isArray(existing.items)) {
    return { ...existing, items: pruneStateItems(existing.items, now) };
  }

  const recentPosts = await fsListCollection(env, 'posts', 350).catch(() => []);
  const items = recentPosts
    .filter(post => post?.authorAccountType === 'uorqui_agent' && post?.sourceHeadline)
    .filter(post => {
      const stamp = new Date(post.createdAt || 0).getTime();
      return Number.isFinite(stamp) && now - stamp <= THIRTY_DAYS;
    })
    .map(post => stateItem({
      title: post.sourceHeadline || '',
      link: post.sourceUrl || '',
      canonicalUrl: post.sourceUrl || '',
      publishedAt: post.sourcePublishedAt || post.createdAt || ''
    }, post.createdAt || new Date(now).toISOString()));

  const state = {
    id: EDITORIAL_STATE_ID,
    initialized: true,
    items: pruneStateItems(items, now),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  };
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, state);
  return state;
}

function pruneStateItems(items = [], now = Date.now()) {
  return items
    .filter(item => {
      const stamp = new Date(item.createdAt || item.publishedAt || 0).getTime();
      return Number.isFinite(stamp) && now - stamp <= THIRTY_DAYS;
    })
    .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 450);
}

async function saveEditorialState(env, state, updatedAt) {
  state.updatedAt = updatedAt;
  state.items = pruneStateItems(state.items, Date.now());
  await fsPut(env, 'systemConfig', EDITORIAL_STATE_ID, state);
}

async function findFreshCandidates(agent, state, now) {
  const [google, bing] = await Promise.all([
    fetchGoogleNews(agent.query).catch(error => {
      console.warn('Google News source failed:', agent.key, error?.message || error);
      return [];
    }),
    fetchBingNews(agent.query).catch(error => {
      console.warn('Bing News source failed:', agent.key, error?.message || error);
      return [];
    })
  ]);

  const seen = new Set();
  return [...google, ...bing]
    .filter(item => item?.title && item?.link)
    .filter(item => {
      const stamp = new Date(item.publishedAt || 0).getTime();
      return !Number.isFinite(stamp) || now - stamp <= FRESH_NEWS_WINDOW;
    })
    .sort((a,b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .filter(item => {
      const key = `${normalizeHeadline(item.title)}|${normalizeNewsUrl(item.link)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter(item => !isDuplicateNews(item, state.items, now))
    .slice(0, 20);
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const response = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0 (compatible; UorquiNews/2.1)', 'Accept':'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Google News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Google Notícias');
}

async function fetchBingNews(query) {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=pt-br&cc=br`;
  const response = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0 (compatible; UorquiNews/2.1)', 'Accept':'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!response.ok) throw new Error(`Bing News HTTP ${response.status}`);
  return parseNewsItems(await response.text(), 'Bing Notícias');
}

function parseNewsItems(xml, fallbackSource = '') {
  const items = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25);
  return items.map(match => {
    const raw = match[1];
    const title = decodeXmlText(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = decodeXmlText(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const pubDate = decodeXmlText(raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const source = decodeXmlText(raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '') || fallbackSource;
    const description = decodeXmlText(raw.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const media = raw.match(/<(?:media:content|media:thumbnail|enclosure)[^>]+(?:url|href)=["']([^"']+)["']/i)?.[1] || '';
    let publishedAt = '';
    try { const d = new Date(pubDate); if (Number.isFinite(d.getTime())) publishedAt = d.toISOString(); } catch {}
    return { title, link, canonicalUrl:link, source, publishedAt, description, imageUrl:decodeXmlText(media) };
  }).filter(item => item.title && item.link);
}

async function enrichArticle(news) {
  const base = { ...news, canonicalUrl: news.canonicalUrl || news.link || '' };
  if (!/^https?:\/\//i.test(base.link || '')) return base;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);
    const response = await fetch(base.link, {
      redirect:'follow', signal:controller.signal,
      headers:{'User-Agent':'Mozilla/5.0 (compatible; UorquiNews/2.1)','Accept':'text/html,application/xhtml+xml'}
    });
    clearTimeout(timer);
    if (!response.ok) return base;
    const html = (await response.text()).slice(0, 500000);
    const finalUrl = response.url || base.link;
    const meta = (name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,'i'));
      const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,'i'));
      return decodeHtml(a?.[1] || b?.[1] || '');
    };
    const imageUrl = meta('og:image') || meta('twitter:image') || base.imageUrl || '';
    const siteName = meta('og:site_name') || base.source || '';
    const canonical = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || finalUrl;
    return { ...base, source:siteName || base.source, canonicalUrl:canonical, imageUrl:/^https?:\/\//i.test(imageUrl)?imageUrl:'' };
  } catch {
    return base;
  }
}

function stateItem(news, createdAt = new Date().toISOString()) {
  const tokens = topicTokens(news.title || '');
  return {
    url: normalizeNewsUrl(news.canonicalUrl || news.link || ''),
    headline: normalizeHeadline(news.title || ''), tokens,
    topicKey: tokens.slice().sort().join('|'),
    publishedAt: news.publishedAt || '', createdAt
  };
}

function rememberNews(state, news, createdAt) {
  state.items.unshift(stateItem(news, createdAt));
  state.items = pruneStateItems(state.items, Date.now());
}

function isDuplicateNews(news, previousItems = [], now = Date.now()) {
  const current = stateItem(news, news.publishedAt || new Date(now).toISOString());
  for (const previous of previousItems) {
    if (current.url && previous.url && current.url === previous.url) return true;
    if (current.headline && previous.headline && current.headline === previous.headline) return true;
    const stamp = new Date(previous.createdAt || previous.publishedAt || 0).getTime();
    if (!Number.isFinite(stamp) || now - stamp > SEMANTIC_WINDOW) continue;
    if (sameTopic(current.tokens, Array.isArray(previous.tokens) ? previous.tokens : topicTokens(previous.headline || ''))) return true;
  }
  return false;
}

function sameTopic(a = [], b = []) {
  if (a.length < 3 || b.length < 3) return false;
  const left = new Set(a), right = new Set(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const minCoverage = common / Math.min(left.size, right.size);
  const union = new Set([...left, ...right]).size || 1;
  const jaccard = common / union;
  return (common >= 4 && minCoverage >= 0.5) || (common >= 3 && minCoverage >= 0.66) || jaccard >= 0.56;
}

function topicTokens(value = '') {
  const sourceFree = String(value).replace(/\s[-–—]\s[^-–—]{2,45}$/u, '');
  return [...new Set(normalizeHeadline(sourceFree).split(' ')
    .filter(token => token.length >= 3)
    .filter(token => !STOPWORDS.has(token))
    .filter(token => !/^\d{1,2}$/.test(token)))]
    .slice(0, 14);
}

function normalizeHeadline(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

function normalizeNewsUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    return `${url.origin}${url.pathname}${url.searchParams.toString()?`?${url.searchParams.toString()}`:''}`.replace(/\/$/,'');
  } catch { return String(value || '').trim(); }
}

async function generateNewsText(env, agent, news) {
  const source = news.source || 'a fonte original';
  const prompt = [
    'Você é editor factual da rede social brasileira Uorqui.',
    `Comunidade: ${agent.name}.`,
    'Use SOMENTE os dados jornalísticos fornecidos abaixo.',
    `MANCHETE: ${news.title}`,
    `FONTE: ${source}`,
    `PUBLICADA EM: ${news.publishedAt || 'recentemente'}`,
    'Escreva entre 250 e 600 caracteres em português do Brasil.',
    'Não invente números, contexto, causas, consequências ou declarações que não estejam na manchete.',
    'Atribua a informação à fonte.',
    'Não use markdown, hashtags ou invente citações.'
  ].join('\n');

  if (env.AI) {
    for (const model of ['@cf/zai-org/glm-4.7-flash','@cf/meta/llama-3.1-8b-instruct-fast']) {
      try {
        const response = await env.AI.run(model, {
          messages:[{role:'system',content:'Priorize precisão factual e nunca acrescente informação não fornecida.'},{role:'user',content:prompt}],
          temperature:0.15,
          ...(model.includes('llama-3.1-8b-instruct-fast') ? {max_tokens:340} : {max_completion_tokens:340})
        });
        const text = extractAiText(response);
        if (text) return clean(text, 1400);
      } catch (error) {
        console.warn('Live news AI model failed:', agent.key, model, error?.message || error);
      }
    }
  }

  const headline = String(news.title || '').replace(/[\s.!?]+$/g,'').trim();
  if (!headline) return '';
  return clean(`Segundo ${source}, ${headline}. A informação vem da matéria original e foi mantida sem acrescentar detalhes não confirmados.`, 1400);
}

async function publishNewsPost(env, agent, news, text, now) {
  const uid = `uorqui_ai_user_${agent.key}`;
  const communityId = `uorqui_ai_community_${agent.key}`;
  const [user, community] = await Promise.all([
    fsGet(env, 'users', uid).catch(() => null),
    fsGet(env, 'communities', communityId).catch(() => null)
  ]);
  if (!user || !community) {
    console.warn('Live news publication target missing:', agent.key, { user: Boolean(user), community: Boolean(community) });
    return null;
  }

  const createdAt = new Date(now).toISOString();
  const postId = `uorqui_ai_live_${agent.key}_${now}_${crypto.randomUUID().slice(0,8)}`;
  const useSourceImage = Boolean(news.imageUrl && stableHash(news.title || '') % 10 < 6);
  const post = {
    id:postId, authorUid:uid, authorName:agent.agent,
    authorAvatarMediaId:user.avatarMediaId || '', authorAccountType:'uorqui_agent', authorAiAssisted:true,
    authorTeamLabel:'Equipe Uorqui · IA', scope:'community', companyId:'', communityId, communityName:agent.name,
    communityVisibility:'public', communityOfficialUorqui:true, communityOfficialLabel:'Oficial Uorqui', topicId:'', topicName:'',
    type:'post', text, title:'', requiresReadReceipt:false, attachments:[], reactionCount:0, commentCount:0,
    aiGenerated:true, aiDisclosure:'Conteúdo assistido por IA pela Equipe Uorqui', aiDay:brazilDateKey(new Date(now)), aiContentMode:'news', aiImageGenerated:false,
    sourceName:news.source || '', sourceUrl:news.canonicalUrl || news.link || '', sourceImageUrl:useSourceImage ? (news.imageUrl || '') : '',
    sourcePublishedAt:news.publishedAt || '', sourceHeadline:news.title || '', newsTopicKey:topicTokens(news.title || '').slice().sort().join('|'),
    createdAt, updatedAt:createdAt
  };
  await fsPut(env, 'posts', postId, post);
  return post;
}

async function notifyCommunityMembers(env, post) {
  const memberships = await fsWhere(env, 'communityMembers', 'communityId', post.communityId, 300).catch(() => []);
  const recipients = [...new Set(memberships.map(item => item.uid).filter(uid => uid && uid !== post.authorUid))];
  if (!recipients.length) return;
  const title = `Nova publicação em ${post.communityName}`;
  const body = `${post.authorName} publicou uma nova notícia.`;
  for (const uid of recipients) {
    const id = `post_${post.id}_${uid}`;
    await fsPut(env, 'notifications', id, { id, recipientUid:uid, type:'new_post', title, body, data:{ postId:post.id, companyId:'', communityId:post.communityId, targetView:'communities' }, read:false, persistent:false, createdAt:post.createdAt }).catch(() => null);
    await sendPushToUser(env, uid, { title, body, postId:post.id, communityId:post.communityId, type:'new_post' }).catch(() => null);
  }
}

async function sendPushToUser(env, uid, payload) {
  const subscriptions = (await fsWhere(env, 'pushSubscriptions', 'uid', uid, 20).catch(() => [])).filter(item => item.enabled !== false && item.token);
  if (!subscriptions.length) return;
  const accessToken = await getGoogleAccessToken(env);
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`;
  for (const subscription of subscriptions) {
    const data = { type:String(payload.type || 'new_post'), postId:String(payload.postId || ''), communityId:String(payload.communityId || ''), url:`/?post=${encodeURIComponent(payload.postId || '')}` };
    const response = await fetch(endpoint, { method:'POST', headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'}, body:JSON.stringify({message:{token:subscription.token,notification:{title:payload.title,body:payload.body},data,webpush:{headers:{Urgency:'normal'},fcm_options:{link:data.url}}}}) }).catch(() => null);
    if (!response?.ok) console.warn('Live news push failed', uid, response?.status || 'network');
  }
}

function promptText(input) { const messages = Array.isArray(input?.messages) ? input.messages : []; return messages.map(message => contentText(message?.content)).filter(Boolean).join('\n'); }
function contentText(content) { if (typeof content === 'string') return content; if (!Array.isArray(content)) return ''; return content.map(part => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : typeof part?.content === 'string' ? part.content : '').filter(Boolean).join('\n'); }
function extractAiText(result) { if (typeof result === 'string') return result.trim(); if (!result || typeof result !== 'object') return ''; const direct = [result.response,result.output_text,result.text,result.result?.response,result.result?.output_text,result.result?.text,result.choices?.[0]?.message?.content,result.choices?.[0]?.text]; for (const candidate of direct) { if (typeof candidate === 'string' && candidate.trim()) return candidate.trim(); const text = contentText(candidate); if (text.trim()) return text.trim(); } return ''; }
function stableHash(value = '') { let hash = 0; for (const ch of String(value)) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0; return Math.abs(hash); }
function brazilDateKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
function clean(value, max = 1000) { return String(value || '').replace(/\u0000/g,'').trim().slice(0,max); }
function decodeXmlText(value = '') { return decodeHtml(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); }
function decodeHtml(value = '') { return String(value || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)||32)); }

function firebaseServiceAccount(env) {
  let email = String(env.FIREBASE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let privateKey = String(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  for (const candidate of [privateKey,email]) {
    const value = String(candidate || '').trim();
    if (!value.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(value);
      email = String(parsed.client_email || email || '').trim();
      privateKey = String(parsed.private_key || privateKey || '').trim();
      if (email && privateKey.includes('BEGIN PRIVATE KEY')) break;
    } catch {}
  }
  return { email, privateKey };
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  const credentials = firebaseServiceAccount(env);
  if (!credentials.email || !credentials.privateKey) throw new Error('Service Account do Firebase incompleta no Worker.');
  const now = Math.floor(Date.now()/1000);
  const header = b64urlJson({alg:'RS256',typ:'JWT'});
  const claims = b64urlJson({ iss:credentials.email, scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600 });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.privateKey);
  const signature = await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token',{ method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}) });
  const data = await response.json().catch(()=>({}));
  if (!response.ok || !data.access_token) throw new Error(`Firebase Service Account recusada: ${data.error_description || data.error || response.status}`);
  googleTokenCache = { token:data.access_token, expires:Date.now()+Number(data.expires_in||3600)*1000 };
  return data.access_token;
}

async function importPrivateKey(pem) {
  const value = String(pem).replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s/g,'');
  const bytes = Uint8Array.from(atob(value),char=>char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
}
function b64urlJson(value) { return b64url(new TextEncoder().encode(JSON.stringify(value))); }
function b64url(bytes) { let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte); return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function fsBase(env) { return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`; }

async function fsRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization',`Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  const response = await fetch(`${fsBase(env)}${path}`,{...options,headers});
  if (response.status === 404) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Firestore HTTP ${response.status}: ${data?.error?.message || text || 'erro'}`);
  return data;
}

async function fsGet(env, collection, docId) { const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`); return doc ? fromDoc(doc) : null; }
async function fsPut(env, collection, docId, object) { const doc = await fsRequest(env, `/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,{ method:'PATCH', body:JSON.stringify({fields:toFields({...object,id:object.id||docId})}) }); return fromDoc(doc); }
async function fsListCollection(env, collection, limit = 300) { const data = await fsRequest(env, `/documents/${encodeURIComponent(collection)}?pageSize=${Math.min(500,Math.max(1,limit))}`); return (data?.documents || []).map(fromDoc); }
async function fsWhere(env, collection, field, value, limit = 100) { const data = await fsRequest(env, '/documents:runQuery',{ method:'POST', body:JSON.stringify({structuredQuery:{ from:[{collectionId:collection}], where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:toValue(value)}}, limit:Math.min(500,Math.max(1,limit)) }}) }); return (Array.isArray(data)?data:[]).map(row=>row.document).filter(Boolean).map(fromDoc); }
function fromDoc(document) { if (!document) return null; const object = fromFields(document.fields || {}); object.id = object.id || decodeURIComponent(String(document.name || '').split('/').pop() || ''); return object; }
function toFields(object) { return Object.fromEntries(Object.entries(object).filter(([,v])=>v!==undefined).map(([k,v])=>[k,toValue(v)])); }
function toValue(value) { if (value === null) return {nullValue:null}; if (typeof value === 'string') return {stringValue:value}; if (typeof value === 'boolean') return {booleanValue:value}; if (typeof value === 'number') return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}; if (Array.isArray(value)) return {arrayValue:{values:value.map(toValue)}}; if (typeof value === 'object') return {mapValue:{fields:toFields(value)}}; return {stringValue:String(value)}; }
function fromFields(fields) { return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,fromValue(v)])); }
function fromValue(value) { if (!value || typeof value !== 'object') return null; if ('stringValue' in value) return value.stringValue; if ('booleanValue' in value) return value.booleanValue; if ('integerValue' in value) return Number(value.integerValue); if ('doubleValue' in value) return Number(value.doubleValue); if ('timestampValue' in value) return value.timestampValue; if ('nullValue' in value) return null; if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue); if ('mapValue' in value) return fromFields(value.mapValue?.fields || {}); return null; }
