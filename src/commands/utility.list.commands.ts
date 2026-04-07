import * as utilityFunctions from './utility.functions.commands.js'
import * as stickerFunctions from './sticker.functions.commands.js'
import * as downloadFunctions from './download.functions.commands.js'
import * as miscFunctions from './misc.functions.commands.js'

const utilityCommands = {
    // === DOWNLOADS ===
    d: {
        guide: `Ex: envie uma mensagem com link suportado - O bot baixa automaticamente mídias do YouTube, Instagram, Facebook, TikTok e Twitter/X.\n`+
        `Ex: *{$p}d* link - Continua funcionando manualmente quando você quiser forçar o download.\n`+
        `Ex: *{$p}d* musica - Busca por título no YouTube.\n`,
        msgs: {
            error_not_found: 'Não foi possível baixar a mídia'
        },
        function: downloadFunctions.downCommand
    },
    play: {
        guide: `Ex: *{$p}p* musica - Faz download de uma música do YouTube e envia como áudio.\n`+
        `Ex: *{$p}p* respondendo um link do YouTube - Converte para áudio.\n`+
        `*Obs*: *{$p}play* continua funcionando por compatibilidade.\n`,
        msgs: {
            wait: "[AGUARDE] 🎧 Sua música está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *9 minutos*",
            error_live: "Esse vídeo não pode ser convertido em áudio, lives não são aceitas.",
            error_not_found: "Nenhum áudio foi encontrado",
            error_no_youtube_link: "❌ A mensagem respondida não contém nenhum link.\n\n💡 Use *{$1}p* respondendo mensagens com links do YouTube ou digite o título da música.",
            error_only_youtube: "❌ O comando *{$1}p* só funciona com links do YouTube ao responder mensagens.\n\n💡 Para outras plataformas, use *{$1}mp3* ou o auto-download."
        },
        function: downloadFunctions.playCommand
    },
    mp3: {
        guide: `Ex: *{$p}mp3* musica - Busca no YouTube e envia só o áudio.\n`+
        `Ex: *{$p}mp3* link - Converte um link suportado em áudio.\n`+
        `Ex: responda um vídeo com *{$p}mp3* - Extrai o áudio do vídeo enviado no WhatsApp.\n`,
        msgs: {
            error_no_input: "Você precisa informar um link, termo de busca ou responder um vídeo.",
            error_not_video: "A mídia respondida precisa ser um vídeo para converter em MP3.",
            error_not_found: "Não foi possível gerar o MP3 a partir do conteúdo informado.",
            error_only_supported: "❌ O link informado não possui vídeo compatível para conversão em MP3."
        },
        function: downloadFunctions.mp3Command
    },
    img: {
        guide: `Ex: *{$p}img* tema - Envia 2 imagens relacionadas ao tema pesquisado.\n`,
        msgs: {
            error: 'Não foi possível obter nenhuma imagem, tente novamente com outra pesquisa.',
        },
        function: downloadFunctions.imgCommand
    },
    
    // === STICKERS ===
    s: {
        guide: `Ex: Envie/responda uma *IMAGEM/VIDEO* com *{$p}s* - Transforma em sticker.\n`+
        `Ex: Responda uma *MENSAGEM DE TEXTO* com *{$p}s* - Transforma em sticker estilo WhatsApp.\n`+
        `Ex: Envie/responda uma *IMAGEM* com *{$p}s 1* - Transforma em sticker circular.\n`+
        `Ex: Envie/responda uma *IMAGEM* com *{$p}s 2* - Transforma em sticker sem perder a proporção.\n`,
        msgs: {
            error_limit: 'O video/gif deve ter no máximo 8 segundos.',
            error_message: "Houve um erro ao obter os dados da mensagem.",
            error_no_text: 'A mensagem citada não possui texto.',
            error_too_long: 'A mensagem é muito longa. Máximo de 500 caracteres.',
            author_text: 'Solicitado por: {$1}'
        },
        function: stickerFunctions.sCommand
    },
    simg: {
        guide: `Ex: Responda um sticker com *{$p}simg* - Transforma o sticker em imagem.\n\n`+
        `*Obs*: Este comando funciona apenas com *STICKERS NÃO ANIMADOS*.\n`,
        msgs: {
            error_sticker: `Este comando pode ser usado apenas respondendo stickers.`
        },
        function: stickerFunctions.simgCommand
    },
    // === FERRAMENTAS ===
    revelar: {
        guide: `Ex: Responda uma mensagem de *visualização única* com *{$p}revelar* - Revela a imagem/vídeo de visualização única.\n\n`+
        `*Obs*: Este comando funciona apenas com mensagens de *VISUALIZAÇÃO ÚNICA* (view once).\n`,
        msgs: {
            error_not_view_once: "Este comando só funciona com mensagens de *visualização única* (view once).",
            error_message: "Houve um erro ao obter os dados da mensagem.",
            wait: "👁️ Revelando mensagem de visualização única...",
            reply_image: "🖼️ *Imagem revelada*\n\n{$1}",
            reply_video: "🎬 *Vídeo revelado*\n\n{$1}"
        },
        function: utilityFunctions.revelarCommand
    },
    save: {
        guide: `Ex: Responda um *áudio* com *{$p}save nome-do-audio* - Salva o áudio globalmente para todos usarem.

`+
        `*Obs*: Este comando funciona apenas com *ÁUDIOS*. O áudio ficará disponível para todos!
`,
        msgs: {
            error_no_name: "Você precisa especificar um nome para salvar o áudio.\nEx: {$p}save gabriel rindo",
            error_name_too_long: "O nome do áudio é muito longo (máximo 100 caracteres).",
            error_already_exists: "Já existe um áudio com o nome *{$1}*. Escolha outro nome!",
            reply: "💾 *Áudio salvo com sucesso!*\n\n"+
            "Nome: *{$1}*\n\n"+
            "Use *{$p}a {$1}* para reproduzir."
        },
        function: utilityFunctions.saveCommand
    },
    audio: {
        guide: `Ex: *{$p}a nome-do-audio* - Reproduz um áudio salvo.\n\n`+
        `Ex: *{$p}a* - Lista os áudios disponíveis.\n\n`+
        `Ex: Responda uma mensagem com *{$p}a nome-do-audio* - Reproduz o áudio como resposta.\n`+
        `*Obs*: *{$p}audio* continua funcionando por compatibilidade.\n`,
        msgs: {
            error_not_found: "Áudio não encontrado. Use *{$p}a* para ver os áudios disponíveis.",
            error_file_not_found: "O arquivo de áudio foi deletado do sistema. Use *{$p}a* para ver os áudios disponíveis."
        },
        function: utilityFunctions.audioCommand
    },
    audios: {
        guide: `Ex: *{$p}audios* - Lista todos os áudios disponíveis (página 1).\n\n`+
        `Ex: *{$p}audios 2* - Lista a página 2 dos áudios.\n`,
        msgs: {
            error_invalid_page: "Número de página inválido.",
            error_no_audios: "Ainda não há nenhum áudio salvo.\n\nUse *{$p}save* para salvar áudios!",
            error_page_out_of_range: "Esta página não existe. Total de páginas: {$1}",
            reply_title: "🎵 *Áudios disponíveis*\n\n"+
            "Página {$1}/{$2} | Total: {$3}\n\n",
            reply_item: "{$1}. *{$2}* ({$3})\n",
            reply_next_page: "\n📄 Use *{$p}audios {$1}* para ver a próxima página."
        },
        function: utilityFunctions.audiosCommand
    },
    delete: {
        guide: `Ex: *{$p}delete nome-do-audio* - Deleta permanentemente um áudio que você criou.\n\n`+
        `*Atenção*: Só o criador pode deletar! Esta ação não pode ser desfeita!`,
        msgs: {
            error_not_found: "Áudio não encontrado. Use *{$p}audios* para ver os áudios disponíveis.",
            error_not_owner: "Você não pode deletar este áudio! Apenas o criador pode deletá-lo.",
            reply: "🗑️ *Áudio deletado!*\n\nO áudio *{$1}* foi removido permanentemente."
        },
        function: utilityFunctions.deleteAudioCommand
    },
    rename: {
        guide: `Ex: *{$p}rename nome-antigo | nome-novo* - Renomeia um áudio que você criou.\n\n`+
        `Use *|* para separar o nome antigo do novo.\n`+
        `*Obs*: Só o criador pode renomear!`,
        msgs: {
            error_invalid_format: "Formato inválido. Use: {$p}rename nome-antigo | nome-novo",
            error_not_found: "Áudio *{$1}* não encontrado. Use *{$p}audios* para ver os áudios disponíveis.",
            error_name_exists: "Já existe um áudio com o nome *{$1}*.",
            error_name_too_long: "O novo nome é muito longo (máximo 100 caracteres).",
            error_not_owner: "Você não pode renomear este áudio! Apenas o criador pode renomeá-lo.",
            reply: "✏️ *Áudio renomeado!*\n\n"+
            "De: *{$1}*\n"+
            "Para: *{$2}*"
        },
        function: utilityFunctions.renameAudioCommand
    },
    
    // === VARIADOS ===
    vtnc: {
        guide: `Ex: *{$p}vtnc* @membro - Manda o ASCII desejado pro membro mencionado.\n\n`+
        `Ex: Responder com *{$p}vtnc* - Manda o ASCII desejado para o membro respondido.\n`,
        msgs: {
            error_mention: "Apenas um membro deve ser marcado por vez.",
            error_message: "Houve um erro ao obter os dados da mensagem.",
            reply: '@{$1} vai tomar no cu!\n\n{$2}'
        },
        function: miscFunctions.vtncCommand
    },
    ask: {
        guide: `Ex: *{$p}ask* qual comando faz download de vídeo? - Pergunta sobre comandos disponíveis usando inteligência artificial.\n`,
        msgs: {
            error_no_question: "Você precisa fazer uma pergunta.\nEx: {$p}ask qual comando salva áudio?",
            error_api: "Erro ao consultar o assistente. Tente novamente.",
            wait: "🤖 Consultando assistente..."
        },
        function: miscFunctions.askCommand
    },
    config: {
        guide: `Ex: *{$p}config ajuda detailed* - Configura o nível de ajuda que você recebe em erros.\n\n`+
        `*Opções de ajuda:*\n`+
        `• *simple* - Apenas mensagem de erro\n`+
        `• *detailed* - Erro + guia do comando (padrão)\n`+
        `• *with-ai* - Erro + guia + assistente IA\n\n`+
        `Ex: *{$p}config ajuda* - Ver configuração atual`,
        msgs: {},
        function: utilityFunctions.configCommand
    }
}

export default utilityCommands
