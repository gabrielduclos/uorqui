import { useState, type FormEvent } from 'react';
import { CalendarRange, Check, ChevronDown, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { channelHistoryDayLabel, isValidCustomChannelRange,
  type ChannelHistoryPeriod, type CustomChannelDateRange } from './channelHistory';

const periods:readonly {value:Exclude<ChannelHistoryPeriod,'custom'>;pt:string;en:string}[]=[
  {value:'all',pt:'Todas as datas',en:'All dates'},
  {value:'today',pt:'Hoje',en:'Today'},
  {value:'yesterday',pt:'Ontem',en:'Yesterday'},
  {value:'last-seven',pt:'Últimos 7 dias',en:'Last 7 days'},
  {value:'this-week',pt:'Esta semana',en:'This week'},
  {value:'last-week',pt:'Semana passada',en:'Last week'},
  {value:'this-month',pt:'Este mês',en:'This month'},
];

/** Dividers remain directly before the first message of their local day.
 * Clicking the date is the filter trigger; custom dates open a focused dialog
 * rather than a full-width toolbar. */
export function ChannelDateFilter({dayKey,todayKey,locale,period,customRange,
  onPeriodChange,onCustomRangeChange}:{
  dayKey:string;todayKey:string;locale:string;
  period:ChannelHistoryPeriod;customRange:CustomChannelDateRange;
  onPeriodChange:(period:ChannelHistoryPeriod)=>void;
  onCustomRangeChange:(range:CustomChannelDateRange)=>void;
}){
  const pt=locale==='pt-BR';
  const label=channelHistoryDayLabel(dayKey,todayKey,locale);
  const [customOpen,setCustomOpen]=useState(false);
  const [startDate,setStartDate]=useState(customRange.from||dayKey);
  const [endDate,setEndDate]=useState(customRange.to||todayKey);
  const [rangeError,setRangeError]=useState(false);
  function openCustom(){
    setStartDate(customRange.from||(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dayKey)?dayKey:todayKey));
    setEndDate(customRange.to||todayKey);
    setRangeError(false);setCustomOpen(true);
  }
  function applyCustom(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const range={from:startDate,to:endDate};
    if(!isValidCustomChannelRange(range)){setRangeError(true);return;}
    onCustomRangeChange(range);
    onPeriodChange('custom');
    setCustomOpen(false);setRangeError(false);
  }
  return <>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={(pt?'Filtrar mensagens · ':'Filter messages · ')+label}
          title={pt?'Filtrar mensagens por período':'Filter messages by period'}
          className="inline-flex min-h-8 max-w-[min(75vw,380px)] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <time dateTime={dayKey} className="truncate">{label}</time>
          {period==='custom'&&<span className="shrink-0 text-[10px] font-semibold text-primary">
            {pt?'Personalizado':'Custom'}</span>}
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0"/>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="center" sideOffset={6} collisionPadding={12}
          className="z-[90] max-h-[min(70dvh,370px)] w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
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
          <DropdownMenu.Separator className="my-1 h-px bg-border"/>
          <DropdownMenu.Item onSelect={openCustom}
            className="relative flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            aria-label={pt?'Selecionar período personalizado':'Choose custom date range'}>
            <CalendarRange className="size-4 shrink-0 text-muted-foreground"/>
            <span className="flex-1">{pt?'Período personalizado…':'Custom date range…'}</span>
            {period==='custom'&&<Check className="size-4 shrink-0 text-primary"/>}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    <Dialog.Root open={customOpen} onOpenChange={open=>{setCustomOpen(open);if(!open)setRangeError(false);}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60"/>
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[101] w-[min(calc(100vw-2rem),420px)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="text-base font-semibold">
              {pt?'Selecionar período':'Select date range'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label={pt?'Fechar':'Close'}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent">
                <X className="size-4"/>
              </button>
            </Dialog.Close>
          </div>
          <form onSubmit={applyCustom} className="space-y-4">
            <label className="block space-y-1.5 text-xs font-medium">
              <span>{pt?'Data inicial':'Start date'}</span>
              <input type="date" required min="1970-01-01" max="2100-12-31"
                value={startDate} onChange={event=>{setStartDate(event.target.value);setRangeError(false);}}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"/>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              <span>{pt?'Data final':'End date'}</span>
              <input type="date" required min="1970-01-01" max="2100-12-31"
                value={endDate} onChange={event=>{setEndDate(event.target.value);setRangeError(false);}}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"/>
            </label>
            <p className="text-xs text-muted-foreground">
              {pt?'As mensagens do dia final também serão incluídas.':'Messages from the entire end date are included.'}
            </p>
            {rangeError&&<p role="alert" className="text-xs text-destructive">
              {pt?'Escolha datas válidas, com a data inicial anterior ou igual à final.':
                'Choose valid dates, with the start date on or before the end date.'}
            </p>}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="min-h-10 rounded-md border border-border px-4 text-sm hover:bg-accent">
                  {pt?'Cancelar':'Cancel'}
                </button>
              </Dialog.Close>
              <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                {pt?'Aplicar filtro':'Apply filter'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
