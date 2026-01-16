import { Bot } from "../interfaces/bot.interface.js"

// MENU PRINCIPAL - MEMBRO COMUM (só vê UTILIDADE)
export const mainMenuMember = (botInfo : Bot)=> { 
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━ ✦ 🔎 *MENU PRINCIPAL* ✦
*|*► *${prefix}menu* 1   ⚒️ Utilidades
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU PRINCIPAL - ADMINISTRADOR DO GRUPO (vê UTILIDADE + GRUPO)
export const mainMenuGroupAdmin = (botInfo : Bot)=> { 
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━ ✦ 🔎 *MENU PRINCIPAL* ✦
*|*► *${prefix}menu* 1   ⚒️ Utilidades
*|*► *${prefix}menu* 2   👨‍👩‍👧‍👦 Grupo
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU PRINCIPAL - DONO DO BOT (vê INFO + UTILIDADE + GRUPO + ADMIN)
export const mainMenuOwner = (botInfo : Bot)=> { 
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━ ✦ 🔎 *MENU PRINCIPAL* ✦
*|*► *${prefix}menu* 0   ❓ Informação
*|*► *${prefix}menu* 1   ⚒️ Utilidades
*|*► *${prefix}menu* 2   👨‍👩‍👧‍👦 Grupo
*|*► *${prefix}menu* 3   ⚙️ Administração
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU - INFO (apenas dono do bot)
export const infoMenu = (botInfo : Bot)=>{
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|* 
*|*━━━━ Guia ❔: *${prefix}comando* guia
*|* 
*|*━━━━ ✦ ❓ *INFO/SUPORTE* ✦
*|*► *${prefix}info* - Informações do bot
*|*► *${prefix}reportar* texto - Reporte um problema
*|*► *${prefix}meusdados* - Exibe seus dados de uso
*|* 
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU - UTILIDADE (UNIFICADO: Downloads + Stickers + Utilidades + Variado)
export const utilityMenuUnified = (botInfo : Bot)=>{
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━━ Guia ❔: *${prefix}comando* guia
*|*
*|*━━━━ ✦ ⚒️ *UTILIDADES* ✦
*|*
*|*━━ ✦ 📥 *DOWNLOADS* ✦
*|*► *${prefix}d* link - Download automático de mídias
*|*► *${prefix}play* nome - Áudio do Youtube
*|*► *${prefix}img* tema - Busca 2 imagens do Google
*|*
*|*━━ ✦ 🖼️ *FIGURINHAS* ✦
*|*► *${prefix}s* - Imagem/vídeo para sticker
*|*► *${prefix}s* 1 - Imagem para sticker (circular)
*|*► *${prefix}s* 2 - Imagem para sticker (sem corte)
*|*► *${prefix}simg* - Sticker para imagem

*|*
*|*━━ ✦ 🛠️ *FERRAMENTAS* ✦
*|*► *${prefix}revelar* - Revelar mensagem visualizar única
*|*► *${prefix}save* - Salvar status
*|*► *${prefix}audio* - Extrai áudio de um video
*|*► *${prefix}audios* - Lista de áudios disponíveis
*|*
*|*━━ ✦ 🧩 *VARIADOS* ✦
*|*► *${prefix}vtnc* - Vai tomar no c*
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU - GRUPO (para membros comuns - apenas visualização)
export const groupMenu = (botInfo : Bot) =>{
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━━ Guia ❔: *${prefix}comando* guia
*|*
*|*━━━━ ✦ 👨‍👩‍👧‍👦 *GRUPO* ✦
*|*
*|*━━ ✦ 🛠️ *GERAL* ✦
*|*► *${prefix}grupo* - Dados do grupo
*|*► *${prefix}adms* - Lista de administradores
*|*► *${prefix}dono* - Dono do grupo
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU - GRUPO (ADMINISTRADOR - com comandos de moderação)
export const groupAdminMenu = (botInfo : Bot)=>{
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━━ Guia ❔: *${prefix}comando* guia
*|*
*|*━━━━ ✦ 👨‍👩‍👧‍👦 *GRUPO* ✦
*|*
*|*━━ ✦ 🛠️ *GERAL* ✦
*|*► *${prefix}grupo* - Dados do grupo
*|*► *${prefix}adms* - Lista de administradores
*|*► *${prefix}fotogrupo* - Altera foto do grupo
*|*► *${prefix}mt* texto - Marca membros/admins com uma mensagem
*|*► *${prefix}mm* texto - Marca membros com uma mensagem
*|*► *${prefix}dono* - Dono do grupo
*|*
*|*━━ ✦ 👤 *MEMBROS* ✦
*|*► *${prefix}membro* @membro - Mostra os dados do membro
*|*► *${prefix}topativos* - Marca os 10 membros mais ativos
*|*► *${prefix}inativos* numero - Marca os membros com menos de um determinado número de mensagens
*|*
*|*━━ ✦ ⌨️ *ADMINISTRATIVO* ✦
*|*► *${prefix}add* +55 219xxxxxxxx - Adiciona ao grupo
*|*► *${prefix}ban* @membro - Bane do grupo
*|*► *${prefix}aviso* @membro - Adiciona um aviso a um membro
*|*► *${prefix}rmaviso* @membro - Remove 1 aviso de um membro
*|*► *${prefix}zeraravisos* - Zera avisos de todos os membros
*|*► *${prefix}restrito* - Abre/feche o grupo só para admin
*|*► *${prefix}promover* @membro - Promove a admin
*|*► *${prefix}rebaixar* @admin - Rebaixa a membro
*|*► *${prefix}link* - Link do grupo
*|*► *${prefix}rlink* - Redefine o link do grupo
*|*► *${prefix}apg* - Apaga mensagem
*|*
*|*━━━━  ✦ 🧰 *RECURSOS* ✦ 
*|*
*|*━━ ✦ ✉️ *BEM VINDO* ✦ 
*|*► *${prefix}bemvindo* - Ativa/desativa a mensagem de bem-vindo
*|*
*|*━━ ✦ 🤫 *MUTAR GRUPO* ✦
*|*► *${prefix}mutar* - Ativa/desativa o uso de comandos somente para admins
*|*
*|*━━ ✦ 🔇 *MUTAR MEMBRO* ✦
*|*► *${prefix}silenciar* @membro - Alterna o mute do membro respondido ou marcado
*|*
*|*━━ ✦ 🏞️ *STICKER AUTOMATICO* ✦
*|*► *${prefix}autosticker* - Ativa/desativa a criação automática de stickers
*|*
*|*━━ ✦ 🚫 *ANTI-LINK* ✦ 
*|*► *${prefix}antilink* - Ativa/desativa o anti-link
*|*► *${prefix}addexlink* - Adiciona links as exceções do anti-link
*|*► *${prefix}rmexlink* - Remove links das exceções do anti-link
*|*
*|*━━ ✦ 🚫 *ANTI-FAKE* ✦ 
*|*► *${prefix}antifake* - Ativa/desativa o anti-fake
*|*► *${prefix}addexfake* - Adiciona prefixos/numeros as exceções do anti-fake
*|*► *${prefix}rmexfake* - Remove prefixos/numeros as exceções do anti-fake
*|*
*|*━━ ✦ 🚫 *ANTI-FLOOD* ✦ 
*|*► *${prefix}antiflood* - Ativa/desativa o anti-flood
*|*
*|*━━ ✦ 🤖 *RESPOSTA AUTOMÁTICA* ✦
*|*► *${prefix}autoresp* - Ativa/desativa as respostas automáticas
*|*► *${prefix}respostas* - Exibe as respostas configuradas
*|*► *${prefix}addresp* palavra resposta - Adiciona uma resposta a palavra
*|*► *${prefix}rmresp* palavra - Remove a resposta para essa palavra
*|*
*|*━━ ✦ 🔒 *BLOQUEIO DE COMANDOS* ✦
*|*► *${prefix}bcmd* !cmd1 !cmd2 - Bloqueia os comandos
*|*► *${prefix}dcmd* !cmd1 !cmd2 - Desbloqueia os comandos
*|*
*|*━━ ✦ 🗒️ *LISTA NEGRA* ✦
*|*► *${prefix}listanegra* - Exibe a lista negra
*|*► *${prefix}addlista* +55 219xxxxxxxx - Adiciona a lista negra
*|*► *${prefix}rmlista* +55 219xxxxxxxx - Remove da lista negra
*|*
*|*━━ ✦ 🚫 *FILTRO DE PALAVRAS* ✦
*|*► *${prefix}addfiltros* palavra - Adiciona palavras ao filtro
*|*► *${prefix}rmfiltros* palavra - Remove palavras do filtro
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

// MENU - ADMIN (apenas dono do bot)
export const adminMenu = (botInfo : Bot)=>{
    let {prefix, name} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━━ Guia ❔: *${prefix}comando* guia
*|*
*|*━━━━ ✦ ⚙️ *ADMINISTRAÇÃO* ✦
*|*
*|*━━ ✦ 🛠️ *GERAL* ✦
*|*► *${prefix}info* - Informação do bot
*|*► *${prefix}ping* - Informação do sistema
*|*► *${prefix}bloquear* @usuario  - Bloqueia o usuário
*|*► *${prefix}desbloquear* @usuario  - Desbloqueia o usuário
*|*► *${prefix}listablock*  - Lista de usuários bloqueados
*|*► *${prefix}bcgrupos* texto - Mensagem para todos os grupos
*|*► *${prefix}desligar* - Desliga o bot
*|*
*|*━━ ✦ 🎨 *CUSTOMIZAÇÃO* ✦
*|*► *${prefix}nomebot* nome - Altera nome do bot
*|*► *${prefix}prefixo* simbolo - Altera o prefixo dos comandos
*|*► *${prefix}fotobot* - Altera foto do bot
*|*► *${prefix}recado* texto - Altera o texto do recado/status
*|*
*|*━━ ✦ 👨‍👩‍👧‍👦 *GRUPOS* ✦
*|*► *${prefix}grupos* - Dados dos grupos atuais
*|*► *${prefix}entrargrupo* link - Entra no grupo
*|*
*|*━━ ✦ 👤 *USUÁRIOS* ✦
*|*► *${prefix}usuario* @usuario - Dados do usuário
*|*
*|*━━━━ ✦ 🧰  *RECURSOS* ✦
*|*
*|*━ ✦ 🏞️  *AUTO-STICKER PRIVADO* ✦
*|*► *${prefix}autostickerpv* - Ativa/desativa a criação automática de stickers no privado
*|*
*|*━ ✦ 🔒 *BLOQUEIO DE COMANDOS* ✦
*|*► *${prefix}bcmdglobal* !cmd1 !cmd2 - Bloqueia os comandos globalmente
*|*► *${prefix}dcmdglobal* !cmd1 !cmd2 - Desbloqueia os comandos globalmente
*|*
*|*━ ✦ ⭐ *MODO ADMIN* ✦
*|*► *${prefix}modoadmin* - Ativa/desativa o modo para apenas admins do bot usarem comandos
*|*
*|*━ ✦ ⏳ *TAXA DE COMANDOS* ✦
*|*► *${prefix}taxacomandos* numero - Ativa/desativa a taxa de comandos por minuto
*|*
*|*━ ✦ 📩 *MENSAGENS PRIVADAS* ✦
*|*► *${prefix}comandospv* - Ativa/desativa os comandos em mensagens privadas
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}
