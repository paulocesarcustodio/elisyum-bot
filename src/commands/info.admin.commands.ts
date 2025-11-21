import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "../interfaces/bot.interface.js"
import { Group } from "../interfaces/group.interface.js"
import { Message } from "../interfaces/message.interface.js"
import * as waUtil from '../utils/whatsapp.util.js'
import { contactsDb, logsDb } from "../database/db.js"

export async function dbStatsCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    try {
        const contactCount = contactsDb.count()
        const commandCount = logsDb.count()
        const commandsLast24h = logsDb.countLast24h()
        const topCommands = logsDb.getTopCommands(5)

        let text = `📊 *Estatísticas do Banco de Dados*\n\n`
        text += `👥 *Contatos:* ${contactCount}\n`
        text += `📝 *Comandos Executados:* ${commandCount}\n`
        text += `🔥 *Últimas 24h:* ${commandsLast24h}\n\n`
        
        text += `🏆 *Top 5 Comandos*\n`
        topCommands.forEach((cmd: any, i: number) => {
            const successRate = ((cmd.success_count / cmd.count) * 100).toFixed(1)
            text += `${i + 1}. \`${cmd.command}\` - ${cmd.count}x (${successRate}% ✅)\n`
        })

        await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
    } catch (err: any) {
        await waUtil.replyText(client, message.chat_id, `❌ Erro: ${err.message}`, message.wa_message, { expiration: message.expiration })
    }
}

export async function logsCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    try {
        const limit = parseInt(message.args[0]) || 10
        const logs = logsDb.getRecent(Math.min(limit, 50))

        if (logs.length === 0) {
            await waUtil.replyText(client, message.chat_id, '📝 Nenhum log encontrado.', message.wa_message, { expiration: message.expiration })
            return
        }

        let text = `📝 *Últimos ${logs.length} Comandos*\n\n`
        
        logs.forEach((log: any, i: number) => {
            const status = log.success ? '✅' : '❌'
            const date = new Date(log.timestamp).toLocaleString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            })
            text += `${i + 1}. ${status} \`${log.command}\``
            if (log.args && log.args.length < 30) text += ` ${log.args}`
            text += `\n   👤 ${log.user_name || 'Desconhecido'}\n`
            text += `   🕐 ${date}\n`
            if (!log.success && log.error_message) {
                text += `   ⚠️ ${log.error_message.substring(0, 50)}${log.error_message.length > 50 ? '...' : ''}\n`
            }
            text += '\n'
        })

        await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
    } catch (err: any) {
        await waUtil.replyText(client, message.chat_id, `❌ Erro: ${err.message}`, message.wa_message, { expiration: message.expiration })
    }
}

export async function contactsListCommand(client: WASocket, botInfo: Bot, message: Message, group?: Group) {
    try {
        const contacts = contactsDb.getAll().slice(0, 20)

        if (contacts.length === 0) {
            await waUtil.replyText(client, message.chat_id, '📇 Nenhum contato no cache.', message.wa_message, { expiration: message.expiration })
            return
        }

        let text = `📇 *Contatos em Cache* (${contactsDb.count()})\n\n`
        
        contacts.forEach((contact, i) => {
            const date = new Date(contact.updated_at).toLocaleDateString('pt-BR')
            const name = contact.notify || contact.name || contact.jid.split('@')[0]
            text += `${i + 1}. *${name}*\n`
            if (contact.phone_number) text += `   📱 ${contact.phone_number}\n`
            text += `   🕐 ${date}\n\n`
        })

        if (contactsDb.count() > 20) {
            text += `_... e mais ${contactsDb.count() - 20} contatos_`
        }

        await waUtil.replyText(client, message.chat_id, text, message.wa_message, { expiration: message.expiration })
    } catch (err: any) {
        await waUtil.replyText(client, message.chat_id, `❌ Erro: ${err.message}`, message.wa_message, { expiration: message.expiration })
    }
}
