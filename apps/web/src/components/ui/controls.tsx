import * as Dialog from '@radix-ui/react-dialog'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

export function Button({ className, variant = 'primary', type = 'button', ...props }:
  ComponentProps<'button'> & { variant?: 'primary' | 'outline' | 'ghost' }) {
  return <button type={type} className={twMerge(clsx(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/85',
    variant === 'outline' && 'border border-border bg-card hover:bg-muted',
    variant === 'ghost' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
    className,
  ))} {...props} />
}

export function Modal({ title, closeLabel, onClose, children }: {
  title: string; closeLabel: string; onClose: () => void; children: ReactNode
}) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-30 bg-black/45" />
      <Dialog.Content aria-describedby={undefined} className="modal">
        <header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><Button variant="ghost" aria-label={closeLabel}><X size={18} /></Button></Dialog.Close>
        </header>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
