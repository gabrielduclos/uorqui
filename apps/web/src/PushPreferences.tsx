import {useState} from 'react';
import {Bell,BellOff} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {useUorquiPreferences} from './UorquiPreferences';
import {useSocialPush} from './useSocialPush';

export function PushPreferences({accountId}:{accountId:string}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const push=useSocialPush(accountId);
  const [showHelp,setShowHelp]=useState(false);
  const permission=typeof Notification==='undefined'?'default':Notification.permission;
  const blocked=push.supported&&permission==='denied';
  const reconnect=push.supported&&permission==='granted'&&push.status!=='ready';
  const checking=push.status==='checking'||push.status==='busy';
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <Bell className="mt-1 size-5 shrink-0 text-primary"/>
      <div>
        <h3 className="text-sm font-semibold">{pt?'Notificações push':'Push notifications'}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {push.status==='unsupported'
            ?(pt?'Instale o PWA para usar push no iPhone, ou use um navegador compatível.':'Install the PWA on iPhone, or use a compatible browser.')
            :push.status==='checking'
              ?(pt?'Verificando a conexão das notificações…':'Checking notification connection…')
              :push.status==='ready'
                ?(pt?'Ativadas e conectadas a esta conta neste dispositivo.':'Enabled and connected to this account on this device.')
                :blocked
                  ?(pt?'O navegador bloqueou as notificações deste site.':'Your browser blocked notifications for this site.')
                  :reconnect
                    ?(pt?'O navegador já permite notificações. Reconecte este dispositivo à sua conta.':'Your browser already allows notifications. Reconnect this device to your account.')
                    :(pt?'Ative as notificações para receber os avisos escolhidos acima.':'Enable notifications to receive the alerts selected above.')}
        </p>
        {blocked&&<p className="mt-2 text-xs text-muted-foreground">
          {pt?'Nas permissões do site (ícone ao lado do endereço), altere Notificações para Permitir e retorne aqui.':'In site permissions (icon beside the address), set Notifications to Allow, then return here.'}
        </p>}
        {blocked&&showHelp&&<p className="mt-2 text-xs text-muted-foreground">
          {pt?'Se não aparecer a opção, abra as configurações de privacidade do navegador, procure as permissões de uorqui.app e recarregue a página após liberar.':'If the option is missing, open your browser privacy settings, find permissions for uorqui.app, and reload after allowing notifications.'}
        </p>}
        {push.error&&<p role="alert" className="mt-2 text-xs text-destructive">{push.error}</p>}
      </div>
    </div>
    <Button type="button" variant={push.status==='ready'||blocked?'outline':'default'}
      disabled={!push.supported||checking}
      onClick={()=>blocked?setShowHelp(value=>!value):void(push.status==='ready'?push.disable():push.enable())}
      className="min-h-11 gap-2">
      {checking?<Spinner className="size-4"/>:push.status==='ready'?<BellOff className="size-4"/>:<Bell className="size-4"/>}
      {push.status==='ready'?(pt?'Desativar':'Disable')
        :blocked?(pt?'Como liberar':'How to allow')
        :reconnect?(pt?'Reconectar':'Reconnect')
        :(pt?'Ativar':'Enable')}
    </Button>
  </section>;
}
