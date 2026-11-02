import { motion } from 'motion/react';
import { UorquiWordmark } from './UorquiWordmark';
import { useUorquiPreferences } from './UorquiPreferences';

/** Shared full-screen loading state for app startup and an API waking up. */
export function StartupSplash({ message }: { message?: string }) {
  const { t } = useUorquiPreferences();
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6"
      role="status" aria-live="polite" aria-label={t('Iniciando Uorqui')}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }} className="text-center">
        <UorquiWordmark className="mx-auto h-9 w-auto max-w-[85vw] text-foreground"/>
        <p className="mt-3 text-sm text-muted-foreground">
          {message ?? t('Preparando sua experiência…')}
        </p>
        <div className="mt-6 h-1 w-52 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <motion.div className="h-full w-1/3 rounded-full bg-primary"
            initial={{ x: '-100%' }} animate={{ x: '310%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}/>
        </div>
      </motion.div>
    </main>
  );
}
