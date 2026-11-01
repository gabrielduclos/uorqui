import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }

/** A consistent text/list layout used while content is being fetched. */
function SkeletonRows({rows=3,className}: {rows?:number;className?:string}){
  return <div role="status" aria-label="Carregando" className={cn("space-y-3",className)}>
    {Array.from({length:rows},(_,i)=><div key={i} className="flex items-center gap-3">
      <Skeleton className="size-10 shrink-0 rounded-full"/>
      <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3"/><Skeleton className="h-3 w-1/2"/></div>
    </div>)}
  </div>;
}
export { SkeletonRows };
