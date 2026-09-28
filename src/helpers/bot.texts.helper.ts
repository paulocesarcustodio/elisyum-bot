const botTexts = {
    starting: "  _____     ______      ___    _________  \r\n |_   _|   |_   _ \\   .\'   `. |  _   _  | \r\n   | |       | |_) | \/  .-.  \\|_\/ | | \\_| \r\n   | |   _   |  __\'. | |   | |    | |     \r\n  _| |__\/ | _| |__) |\\  `-\'  \/   _| |_    \r\n |________||_______\/  `.___.\'   |_____|   \r\n" + "\n  Iniciando na versão {$1}\n",
    connecting: '⏱ Conectando... O bot está conectando e sincronizando as conversas se necessário (Isso pode levar algum tempo)',
    bot_data: "✓ Obteve dados do BOT",
    no_update_available: '✓ Não há atualização disponível, seu bot está na versão mais recente.',
    update_available: '! Uma nova atualização foi encontrada, aguarde o término da atualização...',
    error_check_update: 'Não foi possível checar se há alguma atualização disponível, o bot será iniciado.',
    bot_updated: 'Seu bot foi atualizado com sucesso e será desligado, inicie ele novamente.',
    not_connected: '! Parece que você não está com um dispositivo conectado.\n',
    input_connection_method: 'Qual dos métodos você prefere usar para se conectar?\n\n'+
    '1 - QR Code\n'+
    '2 - Código de Pareamento\n\n',
    input_phone_number: '\nDigite aqui o número em que o bot vai ficar, o número precisa ter o código internacional'+
    '(Ex: 5521912345678) -> ',
    show_pairing_code: 'Seu código de pareamento é {$1}',
    server_started: '✓ Servidor iniciado!',
    groups_loaded: '✓ Todos os grupos foram carregados e atualizados.',
    admin_registered: `✅ Seu número foi cadastrado como DONO, agora você pode utilizar os comandos de {$p}admin`,
    new_user: "🤖 Boas vindas ao {$1}\n\n"+
    `👋 Olá {$2}, vi que você é um usuário novo para abrir o menu de comandos digite *{$p}menu*`,
    new_group: "Saudações *{$1}* , se tiverem alguma dúvida só digitar "+`*{$p}menu*`,
    guide_header_text: '❔ USO DO COMANDO ❔\n\n',
    no_guide_found: 'Não foi encontrado um guia para este comando.',
    error_command_usage: "Parece que você usou o comando *{$1}* incorretamente ou não sabe como utilizá-lo.\n\n"+
    "{$2}",
    error_command: "❗ Não foi possível realizar o comando *{$1}*.\n\n"+
    "*Motivo* : {$2}\n",
    library_error: 'Houve um erro interno ao realizar esse comando, tente novamente mais tarde.',
    command_rate_limited_message : "Você está impossibilitado de mandar comandos por *{$1}* segundos, pega leve cara.",
    group_blocked_command: "O comando *{$1}* está temporariamente bloqueado neste grupo pelo administrador.",
    globally_blocked_command: "O comando *{$1}* está indisponível no momento por ordem do administrador, tente novamente mais tarde.",
    group_welcome_message: "👋 Olá, @{$1}\n"+
    "Seja bem vindo(a) ao grupo *{$2}*\n\n"+
    "{$3}"+
    `Digite *{$p}menu* para ver os comandos.`,
    ban_message : "✅ Entendido, +{$1} será banido.\n\n"+
    "*Tipo*: BAN MANUAL\n"+
    "*Quem baniu*: {$2}",
    blacklist_ban_message : "✅ Entendido, +{$1} será banido.\n\n"+
    "*Tipo*: LISTA NEGRA\n"+
    "*Quem baniu*: {$2}",
    sync_blacklist: '✅ Foram banidos {$1} membros na sincronização da LISTA-NEGRA',
    owner_registered: '✓ Número do DONO configurado.',
    owner_not_found: 'O número do DONO ainda não foi configurado, digite !admin para cadastrar seu número como dono do bot.',
    migrating_database: '! O banco de dados está sendo migrado, por favor aguarde...',
    unknown_command: '🤔 Não reconheci o comando *{$1}*. Digite *{$p}menu* ou *{$p}comando guia* para receber ajuda.',
    user_types: {
        owner: '💻 Dono',
        admin: '⭐ Admin',
        user: '👤 Usuário',
    },
    disconnected:{
        command: "A conexão com o WhatsApp foi encerrada pelo comando do Administrador.",
        fatal_error: "A conexão com o WhatsApp foi encerrada devido a uma falha grave no código.",
        logout: "A sua sessão com o WhatsApp foi deslogada, conecte-se novamente.",
        restart: "A sua conexão com o WhatsApp precisa ser reiniciada, tentando reconectar...",
        bad_connection: "A sua conexão com o WhatsApp foi encerrada, tentando reconectar... Motivo : {$1} - {$2}"
    },
    permission: {
        group: 'Este comando só pode ser usado em *grupos*.',
        bot_group_admin: 'Esse comando só pode ser realizado se o bot for *administrador do grupo*.',
        ban_admin : 'O bot não tem permissão para *banir um administrador*.',
        group_admin: 'Apenas *administradores do grupo* podem usar este comando.',
        owner_only: 'Apenas o *dono do bot* pode usar este comando.',
        owner: 'Apenas o *dono do bot* pode usar este comando.',
        group_moderator: 'Apenas *administradores do grupo* podem usar este comando.',
        owner_group_only: 'Apenas o *dono do grupo* pode usar este comando.',
    }
}

export default botTexts

