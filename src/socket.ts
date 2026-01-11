
import makeWASocket, { fetchLatestBaileysVersion, WASocket } from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'
import configSocket from './config.js'
import { BotController } from './controllers/bot.controller.js'
import { connectionClose, connectionOpen, connectionPairingCode, connectionQr } from './events/connection.event.js'
import { messageReceived } from './events/message-received.event.js'
import { addedOnGroup } from './events/group-added.event.js'
import { groupParticipantsUpdated, ParticipantsUpdateEvent } from './events/group-participants-updated.event.js'
import { partialGroupUpdate } from './events/group-partial-update.event.js'
import { contactsUpdate } from './events/contacts-update.event.js'
import { logNewsletterChatUpdates } from './events/newsletter-chats-update.event.js'
import { logNewslettersUpdate, type NewsletterUpdate } from './events/newsletter-update.event.js'
import { logNewsletterMessages, partitionNewsletterMessages } from './events/newsletter-message.event.js'
import { syncGroupsOnStart } from './helpers/groups.sync.helper.js'
import { executeEventQueue, queueEvent } from './helpers/events.queue.helper.js'
import { checkAndNotifyPatchNotes } from './helpers/patch-notes.helper.js'
import botTexts from './helpers/bot.texts.helper.js'
import { askQuestion, colorText } from './utils/general.util.js'
import { useNeDBAuthState } from './helpers/session.auth.helper.js'
import { SchedulerService } from './services/scheduler.service.js'

//Cache de tentativa de envios
const retryCache = new NodeCache()
//Cache de eventos na fila até o bot inicializar
const eventsCache = new NodeCache()
//Cache de mensagens para serem reenviadas em caso de falha
const messagesCache = new NodeCache({stdTTL: 5*60, useClones: false})
//Cache de mensagens de visualização única (view once) - TTL de 24 horas
const viewOnceCache = new NodeCache({stdTTL: 24*60*60, useClones: false})

export default async function connect(){
    const { state, saveCreds } = await useNeDBAuthState()
    const { version } = await fetchLatestBaileysVersion()
    const client : WASocket = makeWASocket(configSocket(state, retryCache, version, messagesCache))
    let connectionType : string | null = null
    let isBotReady = false
    eventsCache.set("events", [])

    //Eventos
    client.ev.process(async(events)=>{
        const botInfo = new BotController().getBot()

        //Status da conexão
        if (events['connection.update']){
            const connectionState = events['connection.update']
            const { connection, qr, receivedPendingNotifications } = connectionState
            let needReconnect = false

            if (!receivedPendingNotifications) {
                if (qr) {
                    if (!connectionType) {
                        console.log(colorText(botTexts.not_connected, '#e0e031'))
                        connectionType = await askQuestion(botTexts.input_connection_method)

                        if (connectionType == '2') {
                            connectionPairingCode(client)
                        } else {
                            connectionQr(qr) 
                        }
                    } else if (connectionType != '2') {
                        connectionQr(qr) 
                    }
                } else if (connection == 'connecting'){
                    console.log(colorText(botTexts.connecting))
                } else if (connection === 'close'){
                    needReconnect = await connectionClose(connectionState)
                }
            } else {
                await client.waitForSocketOpen()
                connectionOpen(client)
                await syncGroupsOnStart(client)
                isBotReady = true
                await executeEventQueue(client, eventsCache)
                console.log(colorText(botTexts.server_started))
                
                // Inicializa o scheduler de tarefas agendadas
                const scheduler = new SchedulerService(client)
                scheduler.init()
                
                // Verifica e envia patch notes se houver nova versão
                setTimeout(() => {
                    checkAndNotifyPatchNotes(client).catch(err => {
                        console.error('[Socket] Erro ao verificar patch notes:', err)
                    })
                }, 5000) // Aguarda 5 segundos após o bot estar pronto
            }
            
            if (needReconnect) connect()
        }

        // Credenciais
        if (events['creds.update']){
            await saveCreds()
        }

        // Receber mensagem
        if (events['messages.upsert']){
            const message = events['messages.upsert']
            const { newsletterMessages, otherMessages } = partitionNewsletterMessages(message.messages || [])

            if (newsletterMessages.length){
                await logNewsletterMessages(client, {
                    messages: newsletterMessages,
                    type: message.type,
                    requestId: message.requestId
                })
            }

            if (otherMessages.length){
                const regularMessages = { ...message, messages: otherMessages }
                if (isBotReady) await messageReceived(client, regularMessages, botInfo, messagesCache, viewOnceCache)
            }
        }

        // Atualização de participantes no grupo
        if (events['group-participants.update']){
            const rawParticipantsUpdate = events['group-participants.update']
            const participantsUpdate: ParticipantsUpdateEvent = {
                ...rawParticipantsUpdate,
                participants: rawParticipantsUpdate.participants ?? []
            }

            if (isBotReady) await groupParticipantsUpdated(client, participantsUpdate, botInfo)
            else queueEvent(eventsCache, "group-participants.update", rawParticipantsUpdate)
        }
        
        // Novo grupo
        if (events['groups.upsert']){
            const groups = events['groups.upsert']

            if (isBotReady) await addedOnGroup(client, groups, botInfo)
            else queueEvent(eventsCache, "groups.upsert", groups)     
        }

        // Atualização parcial de dados do grupo
        if (events['groups.update']){
            const groups = events['groups.update']

            if (groups.length == 1 && groups[0].participants == undefined){
                if (isBotReady) await partialGroupUpdate(groups[0])
                else queueEvent(eventsCache, "groups.update", groups)
            }
        }

        // Atualização de contatos (captura nomes/notify)
        if (events['contacts.update']){
            const contacts = events['contacts.update']

            if (isBotReady) await contactsUpdate(contacts)
        }

        if (events['chats.update']){
            await logNewsletterChatUpdates(events['chats.update'])
        }

        const newsletterMetaUpdates = (events as Record<string, unknown>)['newsletters.update'] as NewsletterUpdate[] | undefined
        if (newsletterMetaUpdates){
            await logNewslettersUpdate(newsletterMetaUpdates)
        }
    })
}

