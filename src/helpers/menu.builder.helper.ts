import { commandCatalog } from '../application/command-catalog.js'
import type { CommandCategory } from '../domain/contracts.js'
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

// MENU PRINCIPAL - DONO DO BOT (vê UTILIDADE + GRUPO + ADMIN)
export const mainMenuOwner = (botInfo : Bot)=> { 
    let {name, prefix} = botInfo
    return `*|*━━━ ✦ *🤖 ${name?.trim()}* ✦
*|*
*|*━━━ ✦ 🔎 *MENU PRINCIPAL* ✦
*|*► *${prefix}menu* 1   ⚒️ Utilidades
*|*► *${prefix}menu* 2   👨‍👩‍👧‍👦 Grupo
*|*► *${prefix}menu* 3   ⚙️ Administração
*|*
_*M ᴏ ᴅ ᴅ ᴇ ᴅ B ʏ J ᴏ ɴ ɪ ʏ & P ᴀ ᴜ ʟ ᴏ*_ `
}

function categoryMenu(botInfo: Bot, category: CommandCategory, title: string): string {
    const commands = commandCatalog().filter(command => command.category === category)
    const lines = commands.map(command => `*|*► *${botInfo.prefix}${command.name}* — ${command.description}`)
    return [`*|*━━━ ✦ *🤖 ${botInfo.name?.trim()}* ✦`, '*|*', `*|*━━━ ✦ *${title}* ✦`,
        `*|* Guia: escreva o comando seguido de *guia*.`, '*|*', ...lines].join('\n')
}
export const utilityMenuUnified = (botInfo: Bot) => categoryMenu(botInfo, 'utility', '⚒️ UTILIDADES')
export const groupAdminMenu = (botInfo: Bot) => categoryMenu(botInfo, 'group', '👨‍👩‍👧‍👦 GRUPO')
export const adminMenu = (botInfo: Bot) => categoryMenu(botInfo, 'admin', '⚙️ ADMINISTRAÇÃO')
