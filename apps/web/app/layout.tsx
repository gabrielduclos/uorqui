import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Uorqui — Novo workspace',
  description: 'Base nova e independente para o sistema de comunicação empresarial.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
