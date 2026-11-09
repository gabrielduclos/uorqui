import { MonitorOff, RefreshCw, Smartphone, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { UorquiWordmark } from './UorquiWordmark';
import { useUorquiPreferences } from './UorquiPreferences';
import type { AppInstanceStatus } from './useAppInstanceLease';

export function AppInstanceBlocker({kind,status,onTakeover,onRetry,onLogout}:{
  kind: 'desktop' | 'mobile';status:AppInstanceStatus;
  onTakeover:()=>void;onRetry:()=>void;onLogout:()=>void;
}) {
  const {locale}=useUorquiPreferences();
  const pt=locale==='pt-BR';
  const checking=status==='checking', blocked=status==='blocked', error=status==='error';
  const heading = checking ? (pt?'Verificando instância ativa…':'Checking active instance…')
    : blocked ? (pt?'Uorqui já está aberto':'Uorqui is already open')
    : (pt?'Não foi possível verificar a sessão ativa':'Could not verify the active instance');
  const description = checking
    ? (pt?'Verificando qual aba pode usar o aplicativo.':'Checking which tab can use the app.')
    : blocked
      ? (kind==='mobile'
        ? (pt?'Outra aba ou janela mobile já está usando esta conta. Você pode assumir o controle aqui sem sair da conta.':'Another mobile tab or window is using this account. You can take over here without signing out.')
        : (pt?'Outra aba ou janela desktop já está usando esta conta. Você pode assumir o controle aqui sem sair da conta.':'Another desktop tab or window is using this account. You can take over here without signing out.'))
      : (pt?'Verifique sua conexão e tente novamente. Para evitar instâncias duplicadas, o aplicativo ficará suspenso até confirmar o acesso.':'Check your connection and try again. The app stays paused until access can be verified.');
  return <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-5 text-foreground" aria-busy={checking}>
    <div className="mb-8"><UorquiWordmark className="h-7 w-auto text-foreground"/></div>
    <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8" aria-live="polite">
      <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-foreground">
        {checking?<Spinner className="size-6"/>:kind==='mobile'?<Smartphone className="size-7"/>:<MonitorOff className="size-7"/>}
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      {!checking && <div className="mt-2 flex w-full flex-col gap-2">
        <Button onClick={blocked?onTakeover:onRetry} className="w-full gap-2">
          {error&&<RefreshCw className="size-4"/>}
          {blocked?(pt?'Usar nesta aba':'Use this tab'):(pt?'Tentar novamente':'Try again')}
        </Button>
        <Button variant="ghost" onClick={onLogout} className="w-full gap-2">
          <LogOut className="size-4"/>{pt?'Sair da conta':'Sign out'}
        </Button>
      </div>}
    </section>
    <p className="mt-5 max-w-sm text-center text-xs text-muted-foreground">
      {pt?'Desktop e mobile podem continuar conectados ao mesmo tempo. A outra aba será bloqueada, mas não perderá o login.':
        'Desktop and mobile can stay connected simultaneously. The other tab will be paused without losing its login.'}
    </p>
  </main>;
}
