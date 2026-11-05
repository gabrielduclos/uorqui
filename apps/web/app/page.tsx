export default function HomePage() {
  return (
    <main className="empty-workspace">
      <div className="empty-workspace__top">
        <span className="wordmark">UORQUI</span>
        <span className="environment">AMBIENTE DE PREVIEW</span>
      </div>
      <section className="empty-workspace__center" aria-labelledby="page-heading">
        <div className="symbol" aria-hidden="true">U</div>
        <p className="eyebrow">Novo projeto · Base independente</p>
        <h1 id="page-heading">Workspace iniciado do zero</h1>
        <p className="description">
          A estrutura anterior foi retirada desta branch. Esta é uma base limpa em Next.js 16
          para receber o código original do template Sprintrix.
        </p>
        <p className="note">O tema Sprintrix ainda não está instalado: a demonstração pública não inclui os arquivos-fonte licenciados.</p>
      </section>
      <footer className="empty-workspace__bottom">
        <span>Sem API ou contas de produção conectadas</span>
        <span>Uorqui · Novo início</span>
      </footer>
    </main>
  );
}
