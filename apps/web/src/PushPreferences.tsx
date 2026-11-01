import {Bell,BellOff} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {useUorquiPreferences} from './UorquiPreferences';
import {useSocialPush} from './useSocialPush';
export function PushPreferences({accountId}:{accountId:string}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const push=useSocialPush(accountId);
  return <section className="mx-auto my-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 sm:mx-7">
    <div className="flex min-w-0 items-start gap-3">
      <Bell className="mt-1 size-5 shrink-0 text-primary"/>
      <div>
        <h3 className="text-sm font-semibold">{pt?'Notificações push':'Push notifications'}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {push.status==='unsupported'
            ?(pt?'Instale o PWA para usar push no iPhone.':'Install the PWA to use push on iPhone.')
            :push.status==='ready'
              ?(pt?'Ativadas neste dispositivo.':'Enabled on this device.')
              :(pt?'Receba mensagens privadas e novidades das comunidades.':'Receive direct messages and community alerts.')}
        </p>
        {push.error&&<p role="alert" className="mt-2 text-xs text-destructive">{push.error}</p>}
      </div>
    </div>
    <Button type="button" variant={push.status==='ready'?'outline':'default'}
      disabled={!push.supported||push.status==='busy'}
      onClick={()=>void(push.status==='ready'?push.disable():push.enable())}
      className="min-h-11 gap-2">
      {push.status==='busy'?<Spinner className="size-4"/>:push.status==='ready'?<BellOff className="size-4"/>:<Bell className="size-4"/>}
      {push.status==='ready'?(pt?'Desativar':'Disable'):(pt?'Ativar':'Enable')}
    </Button>
  </section>;
}
