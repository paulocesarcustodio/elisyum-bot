import * as utilityFunctions from './utility.functions.commands.js'
import * as stickerFunctions from './sticker.functions.commands.js'
import * as downloadFunctions from './download.functions.commands.js'
import * as miscFunctions from './misc.functions.commands.js'

const utilityCommands = {
    // === DOWNLOADS ===
    d: {
        guide: `Ex: *{$p}d* link - Download automático de mídias do YouTube, Instagram, Facebook, TikTok e Twitter/X.\nTambém funciona respondendo mensagens com links ou buscando por título no YouTube.\n`,
        msgs: {
            error_not_found: 'Não foi possível baixar a mídia'
        },
        function: downloadFunctions.downCommand
    },
    play: {
        guide: `Ex: *{$p}play* musica - Faz download de uma música do Youtube e envia como audio.\nTambém funciona respondendo mensagens com links do YouTube.\n`,
        msgs: {
            wait: "[AGUARDE] 🎧 Sua música está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O vídeo deve ter no máximo *9 minutos*",
            error_live: "Esse vídeo não pode ser convertido em áudio, lives não são aceitas.",
            error_not_found: "Nenhum áudio foi encontrado",
            error_no_youtube_link: "❌ A mensagem respondida não contém nenhum link.\n\n💡 Use *{$p}play* respondendo mensagens com links do YouTube ou digite o título da música.",
            error_only_youtube: "❌ O comando *{$p}play* só funciona com links do YouTube ao responder mensagens.\n\n💡 Para outras plataformas, use *{$p}d*."
        },
        function: downloadFunctions.playCommand
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
    ssf: {
        guide: `Ex: Envie/responda uma *imagem* com *{$p}ssf* - Retira o fundo da imagem e transforma em sticker.\n\n`+
        `*Obs*: Este comando funciona apenas com *IMAGENS*.\n`,
        msgs: {
            wait: `[AGUARDE] 📸 O fundo da imagem está sendo removido e o sticker será enviado em breve.`,
            error_image: `Este comando é válido apenas para imagens.`,
            error_message: "Houve um erro ao obter os dados da mensagem.",
            author_text: 'Solicitado por: {$1}'
        },
        function: stickerFunctions.ssfCommand
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
        guide: `Ex: Responda um *áudio* com *{$p}save nome-do-audio* - Salva o áudio com o nome especificado.\n\n`+
        `*Obs*: Este comando funciona apenas com *ÁUDIOS*.\n`,
        msgs: {
            error_no_name: "Você precisa especificar um nome para salvar o áudio.\nEx: {$p}save gabriel rindo",
            error_name_too_long: "O nome do áudio é muito longo (máximo 100 caracteres).",
            reply: "💾 *Áudio salvo com sucesso!*\n\n"+
            "Nome: *{$1}*\n\n"+
            "Use *{$p}audio {$1}* para reproduzir."
        },
        function: utilityFunctions.saveCommand
    },
    audio: {
        guide: `Ex: *{$p}audio nome-do-audio* - Reproduz o áudio salvo com esse nome.\n\n`+
        `Ex: Responda uma mensagem com *{$p}audio nome-do-audio* - Reproduz o áudio como resposta.\n`,
        msgs: {
            error_not_found: "Áudio não encontrado. Use *{$p}audios* para ver seus áudios salvos.",
            error_file_not_found: "O arquivo de áudio foi deletado do sistema. Use *{$p}audios* para ver seus áudios salvos."
        },
        function: utilityFunctions.audioCommand
    },
    audios: {
        guide: `Ex: *{$p}audios* - Lista todos os seus áudios salvos (página 1).\n\n`+
        `Ex: *{$p}audios 2* - Lista a página 2 dos seus áudios salvos.\n`,
        msgs: {
            error_invalid_page: "Número de página inválido.",
            error_no_audios: "Você ainda não salvou nenhum áudio.\n\nUse *{$p}save* para salvar áudios!",
            error_page_out_of_range: "Esta página não existe. Total de páginas: {$1}",
            reply_title: "🎵 *Seus áudios salvos*\n\n"+
            "Página {$1}/{$2} | Total: {$3}\n\n",
            reply_item: "{$1}. *{$2}* ({$3})\n",
            reply_next_page: "\n📄 Use *{$p}audios {$1}* para ver a próxima página."
        },
        function: utilityFunctions.audiosCommand
    },
    delete: {
        guide: `Ex: *{$p}delete nome-do-audio* - Deleta permanentemente o áudio salvo.\n\n`+
        `*Atenção*: Esta ação não pode ser desfeita!`,
        msgs: {
            error_not_found: "Áudio não encontrado. Use *{$p}audios* para ver seus áudios salvos.",
            reply: "🗑️ *Áudio deletado!*\n\nO áudio *{$1}* foi removido permanentemente."
        },
        function: utilityFunctions.deleteAudioCommand
    },
    rename: {
        guide: `Ex: *{$p}rename nome-antigo | nome-novo* - Renomeia um áudio salvo.\n\n`+
        `Use *|* para separar o nome antigo do novo.`,
        msgs: {
            error_invalid_format: "Formato inválido. Use: {$p}rename nome-antigo | nome-novo",
            error_not_found: "Áudio *{$1}* não encontrado. Use *{$p}audios* para ver seus áudios.",
            error_name_exists: "Já existe um áudio com o nome *{$1}*.",
            error_name_too_long: "O novo nome é muito longo (máximo 100 caracteres).",
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
    }
}

export default utilityCommands
