import * as Dialog from '@radix-ui/react-dialog'
import { clsx } from 'clsx'
import { LoaderCircle, X } from 'lucide-react'
import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

export function Button({ className, variant = 'primary', type = 'button', loading = false,
  disabled, onClick, children, ...props }:
  ComponentProps<'button'> & { variant?: 'primary' | 'outline' | 'ghost'; loading?: boolean }) {
  const [pending, setPending] = useState(false)
  const locked = useRef(false)
  const busy = loading || pending
  return <button type={type} disabled={disabled || busy} aria-busy={busy}
    className={twMerge(clsx(
      'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
      variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/85',
      variant === 'outline' && 'border border-border bg-card hover:bg-muted',
      variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
      className,
    ))} {...props} onClick={async (event) => {
      if (locked.current || busy || disabled) { event.preventDefault(); return }
      const result: unknown = onClick?.(event)
      if (!(result instanceof Promise)) return
      locked.current = true
      setPending(true)
      try { await result } finally { locked.current = false; setPending(false) }
    }}>
    {children}
    {busy && <LoaderCircle className="action-spinner" size={14} aria-hidden="true" />}
  </button>
}

export function Modal({ title, closeLabel, onClose, children, className = '' }: {
  title: string; closeLabel: string; onClose: () => void; children: ReactNode; className?: string
}) {
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-30 bg-black/45" />
      <Dialog.Content aria-describedby={undefined} className={`modal ${className}`} onCloseAutoFocus={(event) => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus() }
      }}>
        <header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" aria-label={closeLabel}><X size={18} /></Button></Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
