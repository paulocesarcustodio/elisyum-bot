import * as utilityFunctions from './utility.functions.commands.js'

const utilityCommands = {
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
    }
}

export default utilityCommands
