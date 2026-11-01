import { useUorquiPreferences } from './UorquiPreferences';
import { PreferencesControls } from './PreferencesControls';
import { ArrowLeft, FileText, Shield, Cookie } from 'lucide-react';

export const LEGAL_VERSION='2026-11-01';
export type LegalDocument='terms'|'privacy'|'cookies';
export function legalDocumentFromPath(path:string):LegalDocument|null{
  const p=path.replace(/\/$/,'');
  return p==='/termos'||p==='/terms'?'terms':p==='/privacidade'||p==='/privacy'?'privacy':p==='/cookies'?'cookies':null;
}
type Clause={title:string;body:string};
const documents:Record<LegalDocument,{title:string;lead:string;clauses:Clause[]}>={
  terms:{
    title:'Termos de Uso',
    lead:'Este documento estabelece as condições para utilizar o Uorqui, uma plataforma social em evolução, com feed, mensagens individuais e comunidades com canais de texto e voz.',
    clauses:[
      {title:'1. Conta e acesso',body:'Ao criar uma conta, você se compromete a fornecer informações verdadeiras, manter sua senha protegida e não compartilhar o acesso. O uso é pessoal; atividades automatizadas abusivas e identidades enganosas podem ser restringidas.'},
      {title:'2. Uso da plataforma',body:'Você pode publicar textos, imagens e vídeos, enviar mensagens privadas e participar de comunidades. É proibido praticar ameaças, assédio, discriminação, fraude, spam, violar direitos de terceiros, expor informações pessoais sem autorização ou publicar conteúdo ilícito.'},
      {title:'3. Conteúdo e direitos autorais',body:'Você continua titular do conteúdo que publicar e declara possuir os direitos necessários. Concede ao Uorqui autorização não exclusiva, limitada à operação do serviço, para hospedar, processar, exibir e disponibilizar seu conteúdo aos destinatários previstos nas suas configurações de visibilidade. Essa autorização termina quando o conteúdo é removido, ressalvadas retenções legalmente justificadas, registros de moderação, cópias técnicas temporárias e direitos de terceiros.'},
      {title:'4. Privacidade e comunicação',body:'Mensagens privadas são destinadas aos participantes da conversa, mas não devem ser tratadas como comunicação com criptografia de ponta a ponta. Conteúdos denunciados podem ser examinados por moderadores autorizados, dentro de limites de necessidade e segurança. A Política de Privacidade explica os tratamentos de dados.'},
      {title:'5. Comunidades e moderação',body:'Administradores de comunidades podem organizar canais e moderar seus espaços. A equipe da plataforma pode investigar denúncias, limitar recursos, remover conteúdos e suspender contas em caso de violação, conforme a gravidade. Denunciar não implica remoção imediata; a análise depende de evidências e contexto.'},
      {title:'6. Disponibilidade e fase beta',body:'O Uorqui está em desenvolvimento e pode apresentar falhas, mudanças ou interrupções. Empregaremos medidas razoáveis de segurança e continuidade, sem prometer disponibilidade ininterrupta. Essas condições não afastam direitos assegurados por lei.'},
      {title:'7. Cancelamento e alterações',body:'Você pode deixar de utilizar o serviço e solicitar providências sobre seus dados pelos canais oficiais de privacidade. Os termos podem ser atualizados; alterações relevantes serão informadas, e uma nova aceitação poderá ser exigida antes de utilizar funcionalidades afetadas.'},
      {title:'8. Legislação aplicável',body:'A interpretação destes termos observa a legislação brasileira, inclusive a Lei Geral de Proteção de Dados Pessoais (LGPD) e normas de proteção do consumidor quando aplicáveis. Este documento não limita direitos irrenunciáveis.'},
    ]
  },
  privacy:{
    title:'Política de Privacidade e LGPD',
    lead:'Este aviso descreve o tratamento de dados pessoais do Uorqui. Ele não substitui consentimentos específicos quando a lei os exigir: o aceite dos Termos de Uso é separado de escolhas opcionais de cookies.',
    clauses:[
      {title:'1. Controlador e contato',body:'O Uorqui é um projeto de rede social em fase beta. Antes da abertura pública, a identidade e o canal privado de contato do controlador para solicitações LGPD precisam estar completos e disponíveis nesta página. Não encaminhe solicitações com dados sensíveis por comentários públicos ou issues do GitHub.'},
      {title:'2. Quais dados são tratados',body:'Podemos tratar nome, identificador público, e-mail, dados de autenticação, foto de perfil, conteúdo de publicações, mensagens e arquivos enviados, participação em comunidades, reações, preferências, denúncias e dados técnicos necessários à segurança, como registros de acesso e informações de sessão. A senha não deve ser armazenada em texto puro.'},
      {title:'3. Finalidades e bases legais',body:'Tratamos informações para cadastrar e autenticar contas, entregar mensagens e publicações, operar comunidades e disponibilizar recursos contratados ou solicitados; prevenir fraudes, realizar moderação e proteger a plataforma; cumprir obrigações legais; e atender solicitações de titulares. Conforme o caso, as bases podem incluir execução de contrato, obrigação legal, exercício regular de direitos, legítimo interesse avaliado e consentimento específico quando aplicável.'},
      {title:'4. Visibilidade, mensagens e denúncias',body:'Publicações e perfis podem ser exibidos conforme as regras e preferências de privacidade. Mensagens são acessíveis aos participantes autorizados e, em situações justificadas, a operadores da plataforma sujeitos a controles de acesso, como investigações de denúncias. Uma denúncia pode preservar uma cópia do conteúdo relevante para revisão, mesmo que a mensagem original seja alterada ou removida.'},
      {title:'5. Infraestrutura e compartilhamento',body:'O serviço utiliza provedores de hospedagem, banco de dados, entrega de mídias, autenticação, proteção antiabuso e comunicação por e-mail, incluindo Cloudflare, Render, Neon e serviços de envio de e-mail conforme a configuração. Esses operadores podem tratar dados para prestar os serviços. Tratamentos e transferências internacionais, quando ocorrerem, devem obedecer às exigências legais aplicáveis.'},
      {title:'6. Cookies e armazenamento local',body:'Cookies e mecanismos técnicos necessários mantêm a autenticação, a segurança e o funcionamento do serviço. Preferências como idioma, tema e estado da interface podem ficar no armazenamento local do navegador. Atualmente o Uorqui não declara ativar cookies opcionais de publicidade ou análises para cadastro. Se essas finalidades forem adicionadas, opções específicas de aceitar, recusar e revogar serão oferecidas antes da ativação.'},
      {title:'7. Prazo de retenção e proteção',body:'Dados são conservados pelo período necessário às finalidades informadas e às obrigações legais aplicáveis. Registros de denúncias podem ser retidos para segurança, auditoria e defesa de direitos por período compatível com essas finalidades. Prazos específicos, procedimentos de exclusão, cópias de segurança e acesso a dados devem ser formalizados e publicados antes do beta aberto.'},
      {title:'8. Direitos do titular',body:'Nos termos da LGPD, você pode solicitar confirmação da existência de tratamento, acesso, correção, informações sobre compartilhamento, anonimização, bloqueio ou exclusão quando cabível, portabilidade na forma da regulamentação, e revisão de decisões exclusivamente automatizadas quando aplicável. Consentimentos opcionais poderão ser revogados; certos dados podem precisar ser conservados por obrigação legal ou defesa de direitos.'},
      {title:'9. Crianças e adolescentes',body:'O tratamento de dados de menores requer atenção especial ao melhor interesse, à legislação aplicável e às salvaguardas adequadas. A plataforma deve implementar e divulgar regras de idade e proteção apropriadas antes de aceitar cadastros de menores.'},
      {title:'10. Atualizações do aviso',body:'Mudanças materiais nas finalidades, categorias ou formas de tratamento serão comunicadas de maneira adequada. Este aviso e os Termos de Uso são versionados para permitir o registro do aceite informado no cadastro.'},
    ]
  },
  cookies:{
    title:'Política de Cookies',
    lead:'Cookies e tecnologias equivalentes são usados apenas quando necessários para a experiência descrita. A opção de continuar usando o site não é tratada como consentimento para rastreamento opcional.',
    clauses:[
      {title:'1. Cookies essenciais de sessão',body:'A autenticação utiliza cookies técnicos para manter sua sessão de forma segura, prevenir abuso e permitir o acesso à sua conta. Esses cookies são necessários ao serviço e não oferecem opção de desativação dentro da aplicação; você pode eliminá-los nas configurações do navegador, o que poderá desconectá-lo.'},
      {title:'2. Proteção contra cadastros automatizados',body:'O cadastro pode usar desafios antiabuso do Cloudflare Turnstile. Esses recursos podem usar sinais técnicos estritamente relacionados à segurança. Consulte as políticas aplicáveis do fornecedor para detalhes adicionais.'},
      {title:'3. Preferências locais',body:'Idioma, aparência e algumas preferências de interface podem ser gravados em localStorage ou mecanismos semelhantes. Eles não servem, por si, para publicidade comportamental.'},
      {title:'4. Cookies opcionais',body:'Nesta versão não ativamos ferramentas próprias de publicidade ou análise comportamental por cookies opcionais. Caso isso mude, o Uorqui solicitará a escolha antes de habilitá-las, permitindo recusar e revogar sem impedir o uso das funções essenciais.'},
      {title:'5. Como gerenciar',body:'Você pode excluir cookies e dados locais nas configurações do navegador. A exclusão pode encerrar sua sessão, limpar preferências e exigir nova autenticação. Esta página continuará acessível sem uma conta.'},
    ]
  }
};
const enDocuments:Record<LegalDocument,{title:string;lead:string;clauses:Clause[]}>={
  terms:{title:'Terms of Use',lead:'Rules for using Uorqui, a developing social platform with a feed, private messages and text/voice communities.',clauses:[
    {title:'1. Account',body:'Provide accurate information, protect your credentials and avoid impersonation or abusive automation.'},
    {title:'2. Acceptable use',body:'Do not post illegal, fraudulent, harassing, hateful, threatening or infringing material, spam, or disclose personal information without permission.'},
    {title:'3. Your content',body:'You retain ownership and grant Uorqui a nonexclusive license solely to host and display content as required to deliver the service, subject to deletion and legally justified retention.'},
    {title:'4. Communications',body:'Private messages are intended for conversation participants but are not represented as end-to-end encrypted. Authorized platform moderators may review content submitted in abuse reports.'},
    {title:'5. Moderation',body:'Community staff manage their own spaces. Platform staff can investigate reports and remove content or restrict accounts where justified; a report does not trigger automatic deletion.'},
    {title:'6. Beta availability',body:'This evolving service may change or experience outages. Mandatory legal and consumer rights remain unaffected.'},
    {title:'7. Changes',body:'Material revisions will be communicated and may require renewed acceptance.'},
    {title:'8. Governing law',body:'Brazilian law, including the Brazilian General Data Protection Law (LGPD), applies where relevant.'},
  ]},
  privacy:{title:'Privacy Notice and LGPD',lead:'How Uorqui processes personal data. Accepting terms is not bundled with optional cookie consent.',clauses:[
    {title:'1. Controller and contact',body:'Uorqui is an early-stage project. The controller identity and confidential privacy contact must be published before open beta. Do not submit sensitive requests in public GitHub issues.'},
    {title:'2. Data categories',body:'Account and authentication details, profiles, posts, messages, media, communities, reactions, reports, preferences, and security/session information.'},
    {title:'3. Purposes and legal bases',body:'Provide the requested service, authentication, security, moderation, legal compliance and data subject requests. Applicable bases may include contract performance, legal obligation, legal claims, assessed legitimate interest, or specific consent.'},
    {title:'4. Access and reports',body:'Content visibility depends on privacy settings. Authorized operators may review reported content; relevant evidence may be preserved for moderation and legal claims.'},
    {title:'5. Processors',body:'Hosting, media, databases, antiabuse and email systems may involve Cloudflare, Render, Neon and configured email providers. International transfers must meet applicable safeguards.'},
    {title:'6. Cookies',body:'Essential authentication and security cookies and local preferences are used. No optional advertising or behavioral analytics cookies are currently declared. If added, separate consent controls will be provided.'},
    {title:'7. Retention',body:'Data are kept only as needed for stated purposes and legal obligations. Specific retention, deletion and backup rules must be finalized and published before open beta.'},
    {title:'8. Rights',body:'Where applicable, request access, correction, information, deletion or restriction, portability, and revocation of optional consent under the LGPD.'},
    {title:'9. Minors',body:'Additional age-related safeguards and appropriate rules must be defined before accepting minors.'},
    {title:'10. Changes',body:'Material privacy changes will be communicated; the notice is versioned.'},
  ]},
  cookies:{title:'Cookie Policy',lead:'Essential technologies support the service; continuing to browse is not consent to optional tracking.',clauses:[
    {title:'1. Essential cookies',body:'Authentication, secure sessions and protection against abuse. Removing them in your browser may sign you out.'},
    {title:'2. Antiabuse',body:'Cloudflare Turnstile may process technical signals to protect registration against bots.'},
    {title:'3. Local storage',body:'Language, theme and user-interface preferences may be stored locally.'},
    {title:'4. Optional cookies',body:'No advertising or behavioral analytics cookies are currently declared. If enabled in the future, users will be able to opt in, decline and withdraw consent.'},
    {title:'5. Controls',body:'Clear cookies and site data in your browser to delete local preferences and sessions.'},
  ]}
};
export function LegalPage({document}: {document:LegalDocument}){
  const {locale}=useUorquiPreferences(),pt=locale==='pt-BR',doc=pt?documents[document]:enDocuments[document];
  const Icon=document==='terms'?FileText:document==='privacy'?Shield:Cookie;
  return <main className="min-h-[100dvh] bg-background text-foreground">
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2 rounded-md text-sm font-semibold hover:text-primary">
          <ArrowLeft className="size-4"/>{pt?'Voltar ao Uorqui':'Back to Uorqui'}</a>
        <PreferencesControls/>
      </div>
    </header>
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-20 sm:px-6">
      <div><div className="mb-3 flex items-center gap-2"><Icon className="size-6 text-primary"/>
        <h1 className="text-2xl font-semibold sm:text-3xl">{doc.title}</h1></div>
        <p className="text-xs text-muted-foreground">{pt?'Versão vigente':'Current version'}: {LEGAL_VERSION}</p>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{doc.lead}</p></div>
      {doc.clauses.map(clause=><section key={clause.title} className="space-y-2 border-t border-border pt-5">
        <h2 className="text-base font-semibold">{clause.title}</h2>
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/85">{clause.body}</p>
      </section>)}
      <nav className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm text-primary" aria-label={pt?'Documentos legais':'Legal documents'}>
        <a href="/termos" className="underline">{pt?'Termos de Uso':'Terms of Use'}</a>
        <a href="/privacidade" className="underline">{pt?'Privacidade / LGPD':'Privacy / LGPD'}</a>
        <a href="/cookies" className="underline">{pt?'Cookies':'Cookies'}</a>
      </nav>
    </article>
  </main>;
}
