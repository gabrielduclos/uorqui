import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { channelHistoryDayLabel, type ChannelHistoryPeriod } from './channelHistory';

const periods:readonly {value:ChannelHistoryPeriod;pt:string;en:string}[]=[
  {value:'all',pt:'Todas as datas',en:'All dates'},
  {value:'today',pt:'Hoje',en:'Today'},
  {value:'yesterday',pt:'Ontem',en:'Yesterday'},
  {value:'last-seven',pt:'Últimos 7 dias',en:'Last 7 days'},
  {value:'this-week',pt:'Esta semana',en:'This week'},
  {value:'last-week',pt:'Semana passada',en:'Last week'},
  {value:'this-month',pt:'Este mês',en:'This month'},
  {value:'older',pt:'Mais antigas',en:'Older'},
];

/** Each divider remains in message order, immediately before the first message
 * of its local calendar day. The day pill itself is the history filter trigger. */
export function ChannelDateFilter({dayKey,todayKey,locale,period,onPeriodChange}:{
  dayKey:string;todayKey:string;locale:string;
  period:ChannelHistoryPeriod;onPeriodChange:(period:ChannelHistoryPeriod)=>void;
}){
  const pt=locale==='pt-BR';
  const label=channelHistoryDayLabel(dayKey,todayKey,locale);
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button type="button" aria-label={(pt?'Filtrar mensagens · ':'Filter messages · ')+label}
        title={pt?'Filtrar mensagens por período':'Filter messages by period'}
        className="inline-flex min-h-8 max-w-[min(75vw,380px)] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <time dateTime={dayKey} className="truncate">{label}</time>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0"/>
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="center" sideOffset={6} collisionPadding={12}
        className="z-[90] max-h-[min(70dvh,370px)] w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
        <DropdownMenu.Label className="px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          {pt?'Filtrar período':'Filter by period'}
        </DropdownMenu.Label>
        <DropdownMenu.Separator className="my-1 h-px bg-border"/>
        <DropdownMenu.RadioGroup value={period} onValueChange={value=>onPeriodChange(value as ChannelHistoryPeriod)}>
          {periods.map(option=><DropdownMenu.RadioItem key={option.value} value={option.value}
            className="relative flex min-h-9 cursor-pointer select-none items-center rounded-md py-2 pl-9 pr-3 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
            <DropdownMenu.ItemIndicator className="absolute left-3 grid size-4 place-items-center">
              <Check className="size-3.5"/>
            </DropdownMenu.ItemIndicator>
            {pt?option.pt:option.en}
          </DropdownMenu.RadioItem>)}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
