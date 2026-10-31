import { useState } from 'react';
import { ArrowLeft, Check, Code2, Github, Info, MessageCircle, Palette, Search, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { PreferencesControls } from './PreferencesControls';
import { useUorquiPreferences } from './UorquiPreferences';

const colors = [
  { label: 'Background', css: '--background' }, { label: 'Surface', css: '--card' },
  { label: 'Popover', css: '--popover' }, { label: 'Primary', css: '--primary' },
  { label: 'Secondary', css: '--secondary' }, { label: 'Muted', css: '--muted' },
  { label: 'Accent', css: '--accent' }, { label: 'Border', css: '--border' },
  { label: 'Ring', css: '--ring' }, { label: 'Danger', css: '--destructive' },
];

export default function UiKit() {
  const { locale, theme } = useUorquiPreferences();
  const pt = locale === 'pt-BR';
  const [sample, setSample] = useState('');
  const [checked, setChecked] = useState(true);
  const [tab, setTab] = useState<'overview' | 'components'>('overview');

  return <main className="min-h-dvh bg-background text-foreground">
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label={pt ? 'Voltar ao Uorqui' : 'Back to Uorqui'} className="grid size-9 shrink-0 place-items-center rounded-lg border border-border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-4" /></a>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">uorqui<span className="text-primary">.</span> / UI Kit</p><p className="hidden text-xs text-muted-foreground sm:block">{pt ? 'Biblioteca de interface' : 'Interface library'}</p></div>
        </div>
        <PreferencesControls />
      </div>
    </header>
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Palette className="size-4" />Uorqui Design System <Badge variant="secondary">v0.1</Badge></div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">UI Kit</h1>
          <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">{pt
            ? 'O sistema visual do Uorqui. Componentes reutilizáveis, cores semânticas, tipografia e estados de interação. Escuro por padrão; claro sempre disponível.'
            : 'The Uorqui visual system. Reusable components, semantic colors, typography, and interaction states. Dark by default, light whenever you want.'}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">React 19</Badge><Badge variant="outline">TypeScript</Badge><Badge variant="outline">Tailwind CSS 4</Badge><Badge variant="outline">Radix</Badge></div>
      </section>
      <nav aria-label={pt ? 'Seções do UI Kit' : 'UI Kit sections'} className="flex w-fit gap-1 border-b border-border pb-2">
        <Button variant={tab === 'overview' ? 'secondary' : 'ghost'} onClick={() => setTab('overview')} className="rounded-md">{pt ? 'Fundamentos' : 'Foundations'}</Button>
        <Button variant={tab === 'components' ? 'secondary' : 'ghost'} onClick={() => setTab('components')} className="rounded-md">{pt ? 'Componentes' : 'Components'}</Button>
      </nav>
      {tab === 'overview' ? <>
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl font-semibold">{pt ? 'Paleta semântica' : 'Semantic palette'}</h2><p className="text-xs text-muted-foreground">{pt ? 'Valores ativos no tema' : 'Values in the active theme'} · {theme === 'dark' ? 'Dark' : 'Light'}</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {colors.map(color => <div key={color.css} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="h-24 border-b border-border" style={{ background: 'var(' + color.css + ')' }} />
              <div className="space-y-0.5 p-3"><p className="text-xs font-semibold">{color.label}</p><code className="block truncate text-[11px] text-muted-foreground">{color.css}</code></div>
            </div>)}
          </div>
        </section>
        <Separator />
        <section className="space-y-5">
          <h2 className="text-xl font-semibold">{pt ? 'Tipografia' : 'Typography'}</h2>
          <div className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7">
            <div><span className="text-xs text-muted-foreground">Display / 48</span><p className="text-4xl font-bold tracking-tight sm:text-5xl">Connect your world.</p></div>
            <Separator />
            <div><span className="text-xs text-muted-foreground">Heading / 24</span><h3 className="text-2xl font-semibold">{pt ? 'Conexões que importam' : 'Connections that matter'}</h3></div>
            <div><span className="text-xs text-muted-foreground">Body / 16</span><p className="text-base">{pt ? 'Uma experiência simples, rápida e acessível para pessoas e comunidades.' : 'A simple, fast, and accessible experience for people and communities.'}</p></div>
            <div><span className="text-xs text-muted-foreground">Caption / 12</span><p className="text-xs text-muted-foreground">{pt ? 'Informações auxiliares e descrições curtas' : 'Supporting information and short descriptions'}</p></div>
          </div>
        </section>
        <Separator />
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">{pt ? 'Princípios' : 'Principles'}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Sparkles, title: pt ? 'Clareza' : 'Clarity', desc: pt ? 'Hierarquia visual e poucas distrações.' : 'Clear hierarchy with minimal distractions.' },
              { icon: ShieldCheck, title: pt ? 'Acessibilidade' : 'Accessibility', desc: pt ? 'Contraste, foco visível e controles nomeados.' : 'Contrast, visible focus and labeled controls.' },
              { icon: Code2, title: pt ? 'Reutilização' : 'Reusability', desc: pt ? 'Tokens compartilhados entre todas as telas.' : 'Shared tokens across every screen.' },
            ].map(item => <Card key={item.title} className="gap-2"><CardHeader><item.icon className="mb-2 size-5 text-primary" /><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.desc}</CardDescription></CardHeader></Card>)}
          </div>
        </section>
      </> : <>
        <section className="space-y-4"><h2 className="text-xl font-semibold">{pt ? 'Botões e estados' : 'Buttons and states'}</h2>
          <Card><CardContent className="flex flex-wrap items-center gap-3 p-6">
            <Button>{pt ? 'Primário' : 'Primary'}</Button><Button variant="secondary">{pt ? 'Secundário' : 'Secondary'}</Button>
            <Button variant="outline">{pt ? 'Contorno' : 'Outline'}</Button><Button variant="ghost">{pt ? 'Discreto' : 'Ghost'}</Button>
            <Button variant="destructive">{pt ? 'Excluir' : 'Delete'}</Button><Button disabled>{pt ? 'Desativado' : 'Disabled'}</Button>
            <Button size="icon" aria-label="Settings"><Settings2 className="size-4" /></Button>
          </CardContent></Card>
        </section>
        <section className="grid gap-5 md:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-lg">{pt ? 'Formulários' : 'Forms'}</CardTitle><CardDescription>{pt ? 'Campos, entradas e controles' : 'Fields, inputs, and controls'}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <label className="block space-y-2 text-sm"><span>{pt ? 'Nome exibido' : 'Display name'}</span><Input value={sample} onChange={e => setSample(e.target.value)} placeholder={pt ? 'Digite um nome' : 'Enter a name'} /></label>
              <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={pt ? 'Pesquisar' : 'Search'} placeholder={pt ? 'Pesquisar…' : 'Search…'} className="pl-9" /></div>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="size-4 accent-primary" />{pt ? 'Receber notificações' : 'Receive notifications'}</label>
            </CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">{pt ? 'Etiquetas e avisos' : 'Badges and notices'}</CardTitle><CardDescription>{pt ? 'Estados sem depender apenas da cor' : 'States that never rely on color alone'}</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2"><Badge>{pt ? 'Ativo' : 'Active'}</Badge><Badge variant="secondary">{pt ? 'Pendente' : 'Pending'}</Badge><Badge variant="outline">Beta</Badge><Badge variant="destructive">{pt ? 'Erro' : 'Error'}</Badge></div>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm"><Info className="size-5 shrink-0 text-primary" /><span>{pt ? 'Mensagem informativa com descrição clara.' : 'Informational message with a clear description.'}</span></div>
              <div className="flex items-center gap-3"><Avatar><AvatarFallback>U</AvatarFallback></Avatar><div><p className="text-sm font-semibold">Uorqui</p><p className="text-xs text-muted-foreground">open source</p></div><Check className="ml-auto size-4 text-primary" /></div>
            </CardContent>
          </Card>
        </section>
        <section className="space-y-4"><h2 className="text-xl font-semibold">{pt ? 'Mensageria' : 'Messaging'}</h2>
          <Card><CardContent className="space-y-4 p-6">
            <p className="text-xs text-muted-foreground">{pt ? 'Exemplo estático da linguagem visual do chat' : 'Static example of the chat visual language'}</p>
            <div className="flex justify-start"><div className="max-w-[78%] bg-muted px-4 py-3 text-sm">{pt ? 'Oi! Vamos conversar?' : 'Hey! Want to chat?'}</div></div>
            <div className="flex justify-end"><div className="max-w-[78%] bg-primary px-4 py-3 text-sm text-primary-foreground">{pt ? 'Claro! Vamos começar.' : 'Sure! Let’s get started.'}</div></div>
            <div className="flex items-center gap-2 border-t border-border pt-4"><MessageCircle className="size-5 text-muted-foreground" /><Input readOnly placeholder={pt ? 'Escrever uma mensagem…' : 'Write a message…'} /><Button size="icon" disabled aria-label={pt ? 'Enviar' : 'Send'}><Info className="size-4" /></Button></div>
          </CardContent></Card>
        </section>
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-5 text-xs text-muted-foreground">
        <span>Uorqui UI Kit · MIT · {pt ? 'Escuro e claro' : 'Dark and light'} · PT/EN</span>
        <a href="https://github.com/gabrielduclos/uorqui" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline underline-offset-4 hover:text-foreground"><Github className="size-4" />GitHub</a>
      </footer>
    </div>
  </main>;
}
