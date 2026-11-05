import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Uorqui — Workspace',
  description: 'Uorqui: comunicação corporativa organizada em canais, mensagens, reuniões e clientes.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
