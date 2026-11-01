import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'pt-BR' | 'en';
export type Theme = 'dark' | 'light';

const en: Record<string, string> = {
  'Início': 'Home', 'Conversas': 'Messages', 'Comunidades': 'Communities', 'Perfil': 'Profile',
  'UI Kit': 'UI Kit', 'Sua conta': 'Your account', 'Acesso à conta': 'Account access',
  'Navegação principal': 'Main navigation', 'Abrir meu perfil': 'Open my profile',
  'Uorqui — ir para o início': 'Uorqui — go home', 'Uorqui — voltar ao início': 'Uorqui — back home',
  'Notificações indisponíveis': 'Notifications unavailable',
  'Notificações chegam em uma próxima etapa': 'Notifications are coming in a future release',
  'Meu perfil': 'My profile', 'Prévia do MVP': 'MVP preview', 'Em construção': 'In development',
  'Seu espaço, suas conexões.': 'Your space, your connections.',
  'Acompanhe pessoas e comunidades que fazem parte do seu mundo.': 'Stay close to the people and communities you care about.',
  'Bem-vindo ao Uorqui': 'Welcome to Uorqui', 'Tudo começa por aqui.': 'It all starts here.',
  'O cadastro e seu perfil já estão funcionando. O feed, as publicações e os vídeos estão sendo preparados.': 'Registration and profiles are working. The feed, posts and videos are being built.',
  'Explorar comunidades': 'Explore communities', 'Ver conversas': 'View messages',
  'O modo Vídeos será uma visualização separada do feed.': 'Video mode will have its own dedicated view.',
  'Seu feed aparecerá aqui': 'Your feed will appear here',
  'Ainda não há publicações reais para mostrar. Quando o backend social estiver pronto, esta área reunirá textos, fotos, carrosséis e vídeos.': 'There are no real posts yet. This area will bring together text, photos, carousels and videos when the social backend is ready.',
  'Lista de conversas': 'Conversation list', 'Buscar conversas de exemplo': 'Search demo conversations',
  'Buscar conversas': 'Search conversations', 'Nenhuma conversa encontrada': 'No conversations found',
  'Tente outro nome. Esta lista é apenas uma prévia visual.': 'Try another name. This list is only a visual preview.',
  'Conversas de demonstração; não há mensagens reais.': 'Demo conversations; there are no real messages.',
  'Conversa demonstrativa': 'Demo conversation', 'Voltar às conversas': 'Back to conversations',
  'Digite uma mensagem…': 'Write a message…', 'Mensagem de demonstração': 'Demo message',
  'Conversa individual': 'One-to-one conversation',
  'As mensagens enviadas aqui ficam apenas nesta prévia, até atualizar a página.': 'Messages sent here only live in this preview until you refresh the page.',
  'Uma conversa de exemplo': 'A sample conversation', 'Tudo certo para a partida?': 'Ready for the match?',
  'Oi! Vamos testar como as conversas vão funcionar?': 'Hey! Want to try out how messaging works?',
  'Claro! Gostei da interface mais limpa.': 'Sure! I like the cleaner interface.',
  'As mensagens privadas serão sempre entre duas pessoas.': 'Private messages will always be between two people.',
  'Ontem': 'Yesterday', 'Rascunho: ': 'Draft: ', '(exemplo)': '(demo)', '· exemplo': '· demo',
  'Comunidades de demonstração': 'Demo communities', 'Criação de comunidades em desenvolvimento': 'Community creation is in development',
  'Criar comunidade indisponível': 'Create community unavailable', 'Lista de canais': 'Channel list',
  'Conteúdo do canal': 'Channel content', 'Voltar aos canais': 'Back to channels',
  'Canais ilustrativos, sem membros reais.': 'Sample channels with no real members.',
  'Canais de texto': 'Text channels', 'Canais de voz': 'Voice channels', 'Sala de voz': 'Voice room',
  'Comunidade demonstrativa. Nenhuma conversa é publicada.': 'Demo community. Nothing is published.',
  'Aqui você poderá conversar por áudio com os membros da comunidade. Conexão de voz ainda não está disponível.': 'Here you will be able to talk with community members. Voice connections are not available yet.',
  'Conectar à voz (em breve)': 'Join voice (coming soon)',
  'Os canais de texto organizam conversas públicas ou privadas conforme as permissões de cada comunidade.': 'Text channels organize public or private conversations according to community permissions.',
  'Bem-vindo a #': 'Welcome to #', 'Mensagem de canal de exemplo': 'Sample channel message',
  'Mensagem em #': 'Message in #', ' (prévia)': ' (preview)',
  'Equipe': 'Team', 'Você (prévia)': 'You (preview)', 'Equipe Uorqui (exemplo)': 'Uorqui team (demo)',
  'Estúdio': 'Studio', 'Um espaço de exemplo para projetos e ideias.': 'A sample space for projects and ideas.',
  'Uma comunidade de demonstração para jogos.': 'A demo gaming community.',
  'geral': 'general', 'projetos': 'projects', 'Sala de conversa': 'Chat room',
  'boas-vindas': 'welcome', 'partidas': 'matches',
  'Seu espaço para apresentar quem você é. A edição do perfil será adicionada em breve.': 'Tell others about yourself. Profile editing is coming soon.',
  'Informações privadas, visíveis apenas para você nesta página.': 'Private information, only visible to you on this page.',
  'Perfil sem nome de usuário': 'Profile without a username', 'Conta ativa': 'Active account',
  'Edição de perfil em desenvolvimento': 'Profile editing is in development', 'Conta Uorqui': 'Uorqui account',
  'Saindo…': 'Signing out…', 'Sair': 'Sign out', 'Sair da conta': 'Sign out',
  'Não foi possível sair da conta. Tente novamente.': 'Unable to sign out. Please try again.',
  'Prévia de interface: os dados abaixo são fictícios e não são salvos.': 'Interface preview: the data below is fictional and is not saved.',
  'Foto': 'Photo', 'Vídeo': 'Video', 'Áudio': 'Audio', 'Arquivo': 'File', 'Localização': 'Location',
  'Abrir no mapa': 'Open in maps', 'Abrir localização compartilhada no mapa': 'Open shared location in maps',
  'Mensagem': 'Message', 'Contato': 'Contact', 'Você': 'You', 'Mensagem anterior': 'Previous message',
  'Mensagem indisponível': 'Message unavailable',
  'Ir para mensagem respondida': 'Go to replied message',
  'editada ·': 'edited ·', 'Remover minha reação': 'Remove my reaction',
  'Opções da mensagem': 'Message options', 'Ações da mensagem': 'Message actions',
  'Responder': 'Reply', 'Reagir à mensagem': 'React to message', 'Copiar texto': 'Copy text',
  'Editar': 'Edit', 'Excluir': 'Delete', 'Mensagem copiada': 'Message copied',
  'Não foi possível copiar': 'Could not copy message',
  'Adicionar anexo': 'Add attachment', 'Selecionar anexo': 'Choose attachment',
  'Capturar mídia com a câmera': 'Capture media with camera', 'Adicionar à conversa': 'Add to conversation',
  'Fechar anexos': 'Close attachments', 'Adicionar': 'Add', 'Câmera': 'Camera',
  'Galeria': 'Gallery', 'Arquivos': 'Files', 'Voltar': 'Back',
  'Emojis': 'Emojis', 'Lista de emojis': 'Emoji picker', 'Fechar emojis': 'Close emojis',
  'Abrir lista de emojis': 'Open emoji picker', 'Expressões': 'Expressions', 'Gestos': 'Gestures',
  'Corações e símbolos': 'Hearts and symbols',
  'Enviar': 'Send', 'Enviar mensagem de demonstração': 'Send demo message',
  'Salvar edição da mensagem': 'Save message edit', 'Gravar áudio': 'Record audio',
  'Finalizar gravação': 'Finish recording',
  'Gravando áudio — toque no botão quadrado para finalizar': 'Recording audio — tap the square button to finish',
  'Solicitando localização ao navegador…': 'Requesting location from your browser…',
  'Localização selecionada — pronta para compartilhar': 'Location selected — ready to share',
  'Remover localização': 'Remove location', 'Remover anexo': 'Remove attachment',
  'Editar foto antes de enviar': 'Edit photo before sending',
  'Fechar editor de foto': 'Close photo editor',
  'Selecione um arquivo válido para a opção escolhida.': 'Choose a valid file for this option.',
  'O limite desta prévia é ': 'This preview limit is ',
  ' por arquivo.': ' per file.',
  'Gravação excedeu o limite de ': 'Recording exceeded the limit of ',
  'Não foi possível preparar a foto. O limite é ': 'Could not prepare photo. The limit is ',
  'Não foi possível obter a localização. Tente novamente.': 'Could not get your location. Try again.',
  'Localização não disponível neste navegador.': 'Location is unavailable in this browser.',
  'Permissão de localização negada. Autorize no navegador para compartilhar.': 'Location permission denied. Allow access in your browser to share.',
  'Não foi possível acessar o microfone. Confira a permissão do navegador.': 'Could not access the microphone. Check browser permissions.',
  'A gravação de áudio não está disponível neste navegador ou conexão.': 'Audio recording is not supported by this browser or connection.',
  'Nenhum áudio foi capturado. Tente novamente.': 'No audio was captured. Try again.',
  'Não foi possível concluir a gravação.': 'Could not finish recording.',
  'Respondendo a ': 'Replying to ', 'Editando mensagem': 'Editing message',
  'Cancelar edição': 'Cancel editing', 'Cancelar resposta': 'Cancel reply', 'Edite sua mensagem…': 'Edit your message…',
  'Foto compartilhada': 'Shared photo', 'Abrir foto': 'Open photo', 'Baixar foto': 'Download photo',
  'Abrir vídeo': 'Open video', 'Mensagem de áudio': 'Audio message', 'Reproduzir áudio': 'Play audio',
  'Pausar áudio': 'Pause audio', 'Posição do áudio': 'Audio position',
  'Alterar velocidade do áudio, atual ': 'Change audio playback speed, currently ',
  ' vezes': ' times', 'Velocidade': 'Speed',
  'Não foi possível reproduzir este áudio.': 'Unable to play this audio.',
  'Visualizador de mídias': 'Media viewer', 'Editar foto': 'Edit photo',
  'Baixar mídia': 'Download media', 'Fechar visualizador': 'Close viewer',
  'Mídia anterior': 'Previous media', 'Próxima mídia': 'Next media',
  'Vídeo compartilhado': 'Shared video',
  'Use ← → para navegar · Esc para fechar': 'Use ← → to navigate · Esc to close',
  'Editor de foto': 'Photo editor', 'Área de desenho sobre a foto': 'Photo drawing area',
  'Desenhar à mão livre': 'Freehand draw', 'Retângulo': 'Rectangle', 'Círculo': 'Circle',
  'Seta': 'Arrow', 'Cor ': 'Color ', 'Desfazer': 'Undo', 'Limpar': 'Clear',
  'Cancelar': 'Cancel', 'Salvar edição': 'Save edits', 'Salvando…': 'Saving…',
  'Não foi possível abrir esta foto.': 'Unable to open this photo.',
  'Não foi possível abrir esta foto para edição.': 'Could not open this photo for editing.',
  'Não foi possível salvar a edição.': 'Could not save the edited image.',
  'Desenhe com o mouse ou toque; a foto original só é substituída após salvar nesta prévia.': 'Draw with your mouse or touch. The original is only replaced after you save this preview.',
  'Iniciando Uorqui': 'Starting Uorqui', 'Preparando sua experiência…': 'Preparing your experience…',
  'Conecte pessoas e interesses': 'Connect people and interests',
  'Descubra. Converse.': 'Discover. Connect.', 'Participe.': 'Belong.',
  'Uma plataforma social que reúne conversas individuais, comunidades e conteúdo em um só lugar.': 'A social platform bringing one-to-one chats, communities and content together.',
  'Conheça o projeto': 'Explore the project',
  'O que você encontra no Uorqui': 'What you can find on Uorqui',
  'Uorqui · Construído em código aberto · Funcionalidades sociais em desenvolvimento': 'Uorqui · Built in the open · Social features in development',
  'Mensagens privadas entre duas pessoas, com uma interface leve e familiar.': 'Private chats between two people, with a simple, familiar interface.',
  'Um espaço contínuo para textos, fotos e vídeos da sua rede.': 'A continuous stream of text, photos and videos from your network.',
  'Grupos com canais de texto e salas de voz organizados por assunto.': 'Communities with text channels and voice rooms organized by topic.',
  'Identidade Uorqui': 'Your Uorqui identity',
  'Escolher forma de acesso': 'Choose sign-in method',
  'Como devemos chamar você?': 'What should we call you?',
  'Voltar para entrar': 'Back to sign in',
  'Servidor indisponível. Tente novamente.': 'Server unavailable. Try again.',
  'Converse, compartilhe e participe das suas comunidades.': 'Chat, share and join your communities.',
  'Converse, compartilhe e participe de comunidades em um só lugar.': 'Chat, share and join communities in one place.',
  'Crie seu perfil para participar do feed e das comunidades.': 'Create your profile to join the feed and communities.',

  'Criar sua conta': 'Create your account', 'Recuperar acesso': 'Recover access',
  'Confirme seu e-mail': 'Confirm your email', 'Definir nova senha': 'Set a new password',
  'Entrar': 'Sign in', 'Seu perfil no Uorqui.': 'Your Uorqui profile.',
  'Comece sua jornada. O feed e as comunidades ainda estão em desenvolvimento.': 'Start your journey. The feed and communities are still in development.',
  'Cadastre-se para criar sua identidade no Uorqui.': 'Sign up to create your Uorqui identity.',
  'Verifique a caixa de entrada e o spam do endereço informado.': 'Check the inbox and spam folder of your email address.',
  'Use seu e-mail para acessar sua conta.': 'Use your email to access your account.',
  'Verificando sessão': 'Checking session', 'Verificando sessão…': 'Checking session…',
  'Escolha um nome de usuário para concluir seu perfil.': 'Choose a username to complete your profile.',
  'Nome de usuário': 'Username', 'Nome exibido': 'Display name',
  'Criar meu perfil': 'Create my profile', 'Criar conta': 'Create account',
  'Entrar com uma conta existente': 'Sign in with an existing account',
  'O servidor está temporariamente indisponível. Você ainda pode conhecer os formulários.': 'The server is temporarily unavailable. You can still explore the forms.',
  'Tentar novamente': 'Try again', 'E-mail da conta': 'Account email',
  'Reenviando…': 'Resending…', 'Reenviar confirmação': 'Resend confirmation',
  'Já confirmei · Entrar': 'Already confirmed · Sign in', 'Seu nome': 'Your name',
  'E-mail': 'Email', 'Senha': 'Password',
  'Ocultar senha': 'Hide password', 'Mostrar senha': 'Show password',
  'Ocultar': 'Hide', 'Mostrar': 'Show',
  'Use pelo menos 12 caracteres.': 'Use at least 12 characters.',
  'Cadastro em preparação: falta ativar a confirmação por e-mail e a proteção contra abuso. Os dados preenchidos serão mantidos.': 'Registration is being prepared: email confirmation and abuse protection must be enabled. Entered information will be preserved.',
  'Esqueci minha senha': 'Forgot password', 'Reenviar confirmação de e-mail': 'Resend email confirmation',
  'Voltar às boas-vindas': 'Back to welcome', 'Já tenho uma conta · Entrar': 'Already have an account · Sign in',
  'Criar minha conta': 'Create my account', 'Aguarde…': 'Please wait…',
  'Enviar link de recuperação': 'Send recovery link', 'Salvar nova senha': 'Save new password',
  'Verificação de segurança': 'Security verification',
  'Não foi possível acessar a API. Tente novamente mais tarde.': 'Could not reach the API. Try again later.',
  'Não foi possível conectar ao servidor. Tente novamente.': 'Could not connect to the server. Please try again.',
  'Conclua a verificação de segurança antes de continuar.': 'Complete the security verification to continue.',
  'A API está indisponível. Verifique a conexão e tente novamente.': 'The API is unavailable. Check your connection and try again.',
  'O cadastro público está sendo preparado. A verificação por e-mail e a proteção contra abuso ainda precisam ser ativadas.': 'Public registration is being prepared. Email verification and abuse protection still need to be enabled.',
  'Sua conta está aguardando confirmação. Você pode solicitar um novo e-mail abaixo.': 'Your account is awaiting verification. You can request another email below.',
  'Não foi possível criar sua conta.': 'Unable to create your account.',
  'E-mail ou senha inválidos.': 'Invalid email or password.',
  'Conta criada! Enviamos um link de confirmação para seu e-mail.': 'Account created! We sent a confirmation link to your email.',
  'A recuperação por e-mail ainda não está disponível.': 'Email recovery is not available yet.',
  'Não foi possível solicitar a redefinição. Tente novamente.': 'Unable to request a reset. Please try again.',
  'Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha.': 'If this email is registered, you will receive a password reset link.',
  'O envio de e-mails ainda não está disponível.': 'Email delivery is not available yet.',
  'Digite um e-mail válido para receber a confirmação.': 'Enter a valid email to receive confirmation.',
  'Se a conta estiver pendente, enviaremos um novo link de confirmação.': 'If the account is pending, we will send another confirmation link.',
  'Não foi possível reenviar o e-mail. Tente novamente.': 'Unable to resend the email. Please try again.',
  'Link inválido. Solicite uma nova recuperação de senha.': 'Invalid link. Request another password reset.',
  'Link inválido ou expirado. Solicite outro.': 'Invalid or expired link. Request another.',
  'Senha redefinida com sucesso. Entre com a nova senha.': 'Password reset successfully. Sign in with your new password.',
  'Não foi possível salvar o perfil.': 'Could not save your profile.',
  'Modo escuro': 'Dark mode', 'Modo claro': 'Light mode', 'Idioma': 'Language',
  'Trocar para inglês': 'Switch to English', 'Trocar para português': 'Switch to Portuguese',
  'Abrir UI Kit': 'Open UI Kit', 'Voltar ao Uorqui': 'Back to Uorqui',
};

type Preferences = { locale: Locale; theme: Theme; t: (value: string) => string;
  setLocale: (next: Locale) => void; setTheme: (next: Theme) => void; };
const Context = createContext<Preferences | null>(null);

function storedPreference<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try { const value = window.localStorage.getItem(key); return choices.find(item => item === value) ?? fallback; }
  catch { return fallback; }
}

export function UorquiPreferences({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    storedPreference<Locale>('uorqui:language', ['pt-BR', 'en'], navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'));
  const [theme, setTheme] = useState<Theme>(() => storedPreference<Theme>('uorqui:theme', ['dark', 'light'], 'dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('uorqui:theme', theme); } catch { /* preference storage optional */ }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem('uorqui:language', locale); } catch { /* preference storage optional */ }
  }, [locale]);

  const value = useMemo<Preferences>(() => ({
    locale, theme, setLocale, setTheme,
    t: (value: string) => locale === 'en' ? en[value] ?? value : value,
  }), [locale, theme]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useUorquiPreferences(): Preferences {
  const result = useContext(Context);
  if (!result) throw new Error('Uorqui preferences provider is missing');
  return result;
}
