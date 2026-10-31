import AuthPanel from './AuthPanel';

const areas = [
  {
    number: '01',
    title: 'Conversas',
    description: 'Mensagens individuais para criar conexões mais próximas. Sem grupos de chat tradicionais.',
  },
  {
    number: '02',
    title: 'Feed',
    description: 'Textos, fotos, carrosséis e vídeos em um feed contínuo, com um modo de vídeos imersivo separado.',
  },
  {
    number: '03',
    title: 'Comunidades',
    description: 'Espaços públicos e privados, canais organizados e salas de voz para compartilhar interesses.',
  },
] as const;

export default function App() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080e1b] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute -top-48 left-1/2 h-120 w-120 -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[100px]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="text-2xl font-bold tracking-tight">uorqui<span className="text-indigo-400">.</span></div>
          <span className="rounded-full border border-slate-600/70 px-3 py-1.5 text-xs text-slate-300">
            Projeto open source · Pré-MVP
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_380px] lg:py-24">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-indigo-300">Uma nova forma de se conectar</p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.12] tracking-tight sm:text-7xl">
              Descubra. Converse. <span className="text-indigo-400">Participe.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              Uma plataforma social aberta que conecta pessoas, conteúdos e comunidades em um só lugar.
            </p>
            <a
              className="mt-9 inline-flex w-fit items-center rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300"
              href="https://github.com/gabrielduclos/uorqui"
              target="_blank"
              rel="noreferrer"
            >
              Conheça o projeto no GitHub
            </a>
          </div>
          <AuthPanel />
        </section>

        <section aria-label="Pilares do projeto" className="grid gap-4 border-t border-white/10 pt-8 pb-10 md:grid-cols-3">
          {areas.map((area) => (
            <article key={area.number} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="mb-5 text-xs font-semibold tracking-[0.16em] text-indigo-300">{area.number}</div>
              <h2 className="text-xl font-semibold">{area.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{area.description}</p>
            </article>
          ))}
        </section>

        <footer className="pb-4 text-xs text-slate-400">Em desenvolvimento · Funcionalidades sociais não estão disponíveis nesta versão.</footer>
      </div>
    </main>
  );
}
