import {useEffect,useState} from 'react';
import {Cookie} from 'lucide-react';
import {useUorquiPreferences} from './UorquiPreferences';
import {Button} from '@/components/ui/button';
const KEY='uorqui:cookie-notice:v1';
export function CookieNotice(){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [visible,setVisible]=useState(()=>{try{return localStorage.getItem(KEY)!=='seen';}catch{return true;}});
  useEffect(()=>{
    const show=()=>setVisible(true);
    window.addEventListener('uorqui:cookie-notice',show);
    return()=>window.removeEventListener('uorqui:cookie-notice',show);
  },[]);
  if(!visible)return null;
  return <aside role="region" aria-label={pt?'Informações sobre cookies':'Cookie information'}
    className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[240] mx-auto max-w-xl rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
    <div className="flex items-start gap-3">
      <Cookie className="mt-0.5 size-5 shrink-0 text-primary"/>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{pt?'Cookies e privacidade':'Cookies and privacy'}</h2>
        <p className="text-xs leading-5 text-muted-foreground">{pt?
          'Utilizamos cookies essenciais para autenticação e segurança e armazenamento local para preferências. Não ativamos cookies opcionais de publicidade ou análise comportamental nesta versão.':
          'We use essential cookies for sign-in and security and local storage for preferences. Optional advertising and behavioral analytics cookies are not enabled in this version.'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/cookies" target="_blank" rel="noopener noreferrer"
            className="text-xs font-medium text-primary underline">{pt?'Política de cookies':'Cookie policy'}</a>
          <a href="/privacidade" target="_blank" rel="noopener noreferrer"
            className="text-xs font-medium text-primary underline">{pt?'Privacidade / LGPD':'Privacy / LGPD'}</a>
          <Button size="sm" onClick={()=>{try{localStorage.setItem(KEY,'seen');}catch{}setVisible(false);}}>
            {pt?'Entendi':'Got it'}</Button>
        </div>
      </div>
    </div>
  </aside>;
}
