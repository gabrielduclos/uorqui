import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, Command, Search, X } from 'lucide-react';

export type WorkspaceCommand = {
  id: string;
  label: string;
  hint: string;
  type: 'module' | 'community';
  run: () => void;
};

export function WorkspaceCommandPalette({
  open, onOpenChange, commands, locale,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  commands: WorkspaceCommand[];
  locale: string;
}) {
  const pt = locale === 'pt-BR';
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(''); setIndex(0); } }, [open]);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(locale);
    if (!term) return commands;
    return commands.filter(item => (item.label + ' ' + item.hint).toLocaleLowerCase(locale).includes(term));
  }, [commands, query, locale]);
  const selected = Math.min(index, Math.max(0, matches.length - 1));
  function choose(action: WorkspaceCommand) {
    onOpenChange(false);
    action.run();
  }
  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex(previous => Math.min(previous + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex(previous => Math.max(0, previous - 1));
    } else if (event.key === 'Enter' && matches[selected]) {
      event.preventDefault();
      choose(matches[selected]);
    }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[370] bg-black/55 backdrop-blur-[2px]" />
      <Dialog.Content aria-describedby="uorqui-palette-description"
        onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); }}
        className="fixed left-1/2 top-[min(18vh,150px)] z-[371] flex max-h-[min(72dvh,550px)] w-[min(94vw,520px)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none">
        <Dialog.Title className="sr-only">{pt ? 'Navegar no Uorqui' : 'Navigate Uorqui'}</Dialog.Title>
        <Dialog.Description id="uorqui-palette-description" className="sr-only">
          {pt ? 'Procure um módulo ou uma comunidade. Use as setas e Enter para navegar.' :
            'Search for a module or community. Use arrows and Enter to navigate.'}
        </Dialog.Description>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
          <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }}
            onKeyDown={keydown} placeholder={pt ? 'Ir para módulo ou comunidade...' : 'Go to a module or community...'}
            aria-label={pt ? 'Buscar no Uorqui' : 'Search Uorqui'}
            className="h-13 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
          <Dialog.Close aria-label={pt ? 'Fechar busca' : 'Close search'}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="size-4"/>
          </Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-2" role="listbox" aria-label={pt ? 'Destinos' : 'Destinations'}>
          {matches.map((action,idx) => <button type="button" key={action.id} role="option"
            aria-selected={selected === idx} onMouseEnter={() => setIndex(idx)}
            onClick={() => choose(action)}
            className={'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm '+
              (selected === idx ? 'bg-secondary text-foreground' : 'text-foreground hover:bg-accent')}>
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground">
              {action.type === 'community' ? <span className="text-sm font-semibold">{action.label.charAt(0).toUpperCase()}</span> : <Command className="size-4"/>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{action.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{action.hint}</span>
            </span>
            {selected === idx && <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>}
          </button>)}
          {matches.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">
            {pt ? 'Nenhum resultado encontrado' : 'No results'}
          </p>}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span>{pt ? '↑ ↓ navegar · Enter abrir' : '↑ ↓ navigate · Enter open'}</span>
          <span>Esc</span>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
