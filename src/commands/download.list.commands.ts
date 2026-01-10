import * as downloadFunctions from './download.functions.commands.js'

const downloadCommands = {
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
            error_only_youtube: "❌ O comando *{$p}play* só funciona com links do YouTube ao responder mensagens.\n\n💡 Para outras plataformas, use *{$p}d* ou os comandos específicos (*{$p}ig*, *{$p}tk*, etc)."
        },
        function: downloadFunctions.playCommand
    },
    yt: {
        guide: `Ex: *{$p}yt* titulo - Faz download de um video do Youtube com o titulo digitado e envia.\nTambém funciona respondendo mensagens com links do YouTube.\n`,
        msgs: {
            wait: "[AGUARDE] 🎥 Seu video está sendo baixado e processado.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O video deve ter no máximo *9 minutos*",
            error_live: "Houve um erro de download, o bot não aceita download de lives.",
            error_not_found: "Nenhum vídeo foi encontrado"
        },
        function: downloadFunctions.ytCommand
    },
    fb: {
        guide: `Ex: *{$p}fb* link - Faz download de um video do Facebook pelo link digitado e envia.\nTambém funciona respondendo mensagens com links do Facebook.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Título*: {$1}\n"+
            "*Duração*: {$2}",
            error_limit: "O video deve ter no máximo *9 minutos*"
        },
        function: downloadFunctions.fbCommand
    },
    ig: {
        guide: `Ex: *{$p}ig* link - Faz download de videos/fotos do Instagram pelo link digitado e envia.\nTambém funciona respondendo mensagens com links do Instagram.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Autor*: {$1} (@{$2})\n"+
            "*Descrição*: {$3}\n"+
            "*Likes*: {$4}",
        },
        function: downloadFunctions.igCommand
    },
    x: {
        guide: `Ex: *{$p}x* link - Faz download de um video/imagem do X pelo link digitado e envia.\nTambém funciona respondendo mensagens com links do Twitter/X.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Postagem*: {$1}",
            error_not_found: 'Não foi encontrada nenhuma mídia, verifique o link'
        },
        function: downloadFunctions.xCommand
    },
    tk: {
        guide: `Ex: *{$p}tk* link - Faz download de um video do Tiktok pelo link digitado e envia.\nTambém funciona respondendo mensagens com links do TikTok.\n`,
        msgs: {
            wait: "[AGUARDE] 🎬 Sua mídia está sendo baixada e processada.\n\n"+
            "*Perfil*: @{$1}\n"+
            "*Descrição*: {$2}",
            error_not_found: 'Não foi encontrada nenhuma mídia, verifique o link'
        },
        function: downloadFunctions.tkCommand
    },
    img: {
        guide: `Ex: *{$p}img* tema - Envia uma imagem com o tema que você digitar.\n`,
        msgs: {
            error: 'Não foi possível obter nenhuma imagem, tente novamente com outra pesquisa.',
        },
        function: downloadFunctions.imgCommand
    }
}

export default downloadCommands