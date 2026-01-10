import * as stickerFunctions from './sticker.functions.commands.js'

const stickerCommands = {
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
    }
}

export default stickerCommands