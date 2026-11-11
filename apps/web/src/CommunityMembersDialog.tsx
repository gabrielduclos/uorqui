import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Search, Users, X } from 'lucide-react';
import { apiRequest as api } from './lib/apiClient';
import { compactUserName } from './userDisplayName';
import { useUorquiPreferences } from './UorquiPreferences';
import { UserAvatar } from './UserProfiles';
import { navigateToPublicProfile } from './publicProfileNavigation';
import { WorkspaceContentLoading } from './ui-kit/WorkspaceContentLoading';
import { Button } from '@/components/ui/button';

type CommunityMember={
  handle:string;displayName:string;avatarUrl:string|null;
  role:'owner'|'admin'|'moderator'|'member';joinedAt:string;
};
const roleLabels={
  owner:{pt:'Proprietário',en:'Owner'},
  admin:{pt:'Administrador',en:'Admin'},
  moderator:{pt:'Moderador',en:'Moderator'},
  member:{pt:'Membro',en:'Member'}
} as const;

/** Any accepted community member can inspect this directory. Management
 * controls remain in CommunityModerationPanel and are not available here. */
export default function CommunityMembersDialog({id,name,open,onOpenChange}:{
  id:string|null;name:string;open:boolean;onOpenChange:(open:boolean)=>void;
}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR';
  const [members,setMembers]=useState<CommunityMember[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    if(!open||!id){setMembers([]);setError('');setQuery('');return;}
    let current=true;
    setLoading(true);setError('');setQuery('');setMembers([]);
    void api<{members:CommunityMember[]}>('/api/v1/communities/'+encodeURIComponent(id)+'/members')
      .then(data=>{if(current)setMembers(data.members);})
      .catch(()=>{if(current)setError(pt?'Não foi possível carregar os membros.':'Could not load members.');})
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[open,id,reload,pt]);
  const searched=query.trim().toLocaleLowerCase();
  const visible=members.filter(member=>!searched||
    (member.displayName+' '+member.handle+' '+(pt?roleLabels[member.role].pt:roleLabels[member.role].en))
      .toLocaleLowerCase().includes(searched));
  return <Dialog.Root open={Boolean(open&&id)} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[290] bg-black/70 backdrop-blur-[2px]"/>
      <Dialog.Content aria-describedby={undefined}
        className="fixed inset-0 z-[300] flex h-[100dvh] w-full flex-col overflow-hidden bg-card text-card-foreground shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(85dvh,720px)] sm:w-[min(92vw,520px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Users className="size-5 shrink-0 text-primary"/>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="truncate text-base font-semibold">{pt?'Membros da comunidade':'Community members'}</Dialog.Title>
            <p className="truncate text-xs text-muted-foreground">{name}{!loading&&members.length?' · '+members.length:''}</p>
          </div>
          <Dialog.Close asChild>
            <Button type="button" size="icon" variant="ghost" aria-label={pt?'Fechar membros':'Close members'}>
              <X className="size-5"/>
            </Button>
          </Dialog.Close>
        </header>
        <div className="shrink-0 border-b border-border px-4 py-3">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground"/>
            <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
              aria-label={pt?'Pesquisar membros':'Search members'}
              placeholder={pt?'Pesquisar por nome ou @usuário':'Search by name or @username'}
              className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"/>
          </label>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading&&<WorkspaceContentLoading label={pt?'Carregando membros':'Loading members'} rows={4}/>}
          {!loading&&error&&<div className="space-y-3 p-4 text-center">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={()=>setReload(old=>old+1)}>
              {pt?'Tentar novamente':'Try again'}
            </Button>
          </div>}
          {!loading&&!error&&!visible.length&&<p className="py-10 text-center text-sm text-muted-foreground">
            {pt?'Nenhum membro encontrado.':'No members found.'}
          </p>}
          {!loading&&!error&&visible.map(member=><a key={member.handle} href={'/@'+member.handle}
            className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
            onClick={event=>{
              if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
              navigateToPublicProfile(event,member.handle);
              onOpenChange(false);
            }}>
            <UserAvatar name={compactUserName(member.displayName)} image={member.avatarUrl} size="sm"/>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{compactUserName(member.displayName)}</span>
              <span className="block truncate text-xs text-muted-foreground">@{member.handle}</span>
            </span>
            <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {pt?roleLabels[member.role].pt:roleLabels[member.role].en}
            </span>
          </a>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
