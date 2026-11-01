import { SmilePlus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type CommunityReaction={emoji:string;count:number;mine:boolean};
export const COMMUNITY_REACTIONS=['👍','❤️','😂','😮','😢','🔥','👏','🎉','💯','💜','✅','🤔','🙌','👎','😍','🥰','🙏','😎'] as const;

export default function CommunityMessageReactions({reactions,canReact,open,busy,pt,onToggle,onOpen}:{
  reactions:CommunityReaction[];canReact:boolean;open:boolean;busy:boolean;pt:boolean;
  onToggle:(emoji:string,mine:boolean)=>void;onOpen:()=>void;
}){
  if(!canReact&&!reactions.length)return null;
  return <div className="mt-2 min-w-0 space-y-2">
    <div className="flex flex-wrap items-center gap-1.5">
      {reactions.map(item=><button key={item.emoji} type="button" disabled={!canReact||busy}
        title={pt?(item.mine?'Remover minha reação':'Reagir com '+item.emoji):(item.mine?'Remove my reaction':'React with '+item.emoji)}
        aria-label={item.emoji+' · '+item.count+(item.mine?(pt?' · sua reação':' · your reaction'):'')}
        aria-pressed={item.mine}
        onClick={()=>onToggle(item.emoji,item.mine)}
        className={cn('inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs tabular-nums transition-colors',
          item.mine?'border-primary bg-primary/15 text-primary':'border-border bg-secondary/45 text-foreground hover:border-primary/60',
          (!canReact||busy)&&'cursor-default opacity-75')}>
        <span className="text-base leading-none">{item.emoji}</span><span className="font-semibold">{item.count}</span>
      </button>)}
      {canReact&&<button type="button" disabled={busy} onClick={onOpen} aria-expanded={open}
        aria-label={pt?'Adicionar reação':'Add reaction'}
        className={cn('inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground',
          open&&'border-primary bg-primary/10 text-primary')}>
        {busy?<Spinner className="size-4"/>:<SmilePlus className="size-4"/>}
      </button>}
    </div>
    {open&&canReact&&<div className="grid w-fit max-w-full grid-cols-6 gap-1 rounded-xl border border-border bg-card p-2 shadow-sm sm:grid-cols-9"
      role="group" aria-label={pt?'Escolha uma reação':'Choose a reaction'}>
      {COMMUNITY_REACTIONS.map(emoji=><button key={emoji} type="button" disabled={busy}
        title={emoji} aria-label={(pt?'Reagir com ':'React with ')+emoji}
        onClick={()=>onToggle(emoji,reactions.some(x=>x.emoji===emoji&&x.mine))}
        className="grid size-9 place-items-center rounded-lg text-xl hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
        {emoji}
      </button>)}
    </div>}
  </div>;
}
