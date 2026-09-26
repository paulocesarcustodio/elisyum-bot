
import makeWASocket, { fetchLatestBaileysVersion, type WAVersion, WASocket } from '@whiskeysockets/baileys'
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
import { useSQLiteAuthState } from './helpers/session.auth.helper.js'
import { SchedulerService } from './services/scheduler.service.js'
import { setBoundedCache } from './utils/cache.util.js'

//Cache de tentativa de envios
const retryCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 })
//Cache de eventos na fila até o bot inicializar
const eventsCache = new NodeCache({ useClones: false })
//Cache de mensagens para serem reenviadas em caso de falha
const messagesCache = new NodeCache({stdTTL: 5*60, useClones: false})
//Cache de mensagens de visualização única (view once) - TTL de 24 horas
const viewOnceCache = new NodeCache({stdTTL: 6*60*60, useClones: false})

//Controle de reconexão
let reconnectAttempts = 0
const BASE_RECONNECT_DELAY_MS = 10_000
const MAX_RECONNECT_DELAY_MS = 300_000
let isSyncingOnStart = false
let activeClient: WASocket | undefined

export default async function connect(){
    const { state, saveCreds } = await useSQLiteAuthState()
    let version: WAVersion | undefined

    try {
        const latestVersion = await fetchLatestBaileysVersion()
        version = latestVersion.version
    } catch (error) {
        console.warn('[socket] Não foi possível obter a versão mais recente do WA Web. Usando a versão interna do Baileys.', error)
    }

    const client : WASocket = makeWASocket(configSocket(state, retryCache, version, messagesCache))
    let connectionType : string | null = null
    let isBotReady = false
    let reconnectScheduled = false
    eventsCache.set("events", [])

    //Eventos
    client.ev.process(async(events)=>{
        if (activeClient !== client) return
        const botInfo = new BotController().getBot()

        //Persiste credenciais ANTES de processar conexão (evita reconectar com creds desatualizadas)
        if (events['creds.update']){
            await saveCreds()
        }

        //Status da conexão
        if (events['connection.update']){
            const connectionState = events['connection.update']
            const { connection, qr, receivedPendingNotifications } = connectionState
            let needReconnect = false

            if (connection === 'close') {
                isBotReady = false
                needReconnect = await connectionClose(connectionState)
            } else if (!receivedPendingNotifications) {
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
                }
            } else if (!isBotReady) {
                reconnectAttempts = 0
                await client.waitForSocketOpen()
                connectionOpen(client)
                if (!isSyncingOnStart) {
                    isSyncingOnStart = true
                    try {
                        await syncGroupsOnStart(client)
                    } finally {
                        isSyncingOnStart = false
                    }
                }
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
            
            if (needReconnect) {
                if (reconnectScheduled) return
                reconnectScheduled = true

                reconnectAttempts++
                const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, Math.min(reconnectAttempts - 1, 5)), MAX_RECONNECT_DELAY_MS)
                const jitter = Math.round(Math.random() * 2000)
                const totalDelay = delay + jitter
                console.log(colorText(`[RECONEXÃO] Tentativa ${reconnectAttempts} — aguardando ${totalDelay/1000}s...`))

                await new Promise(r => setTimeout(r, totalDelay))
                while (activeClient === client) {
                    try {
                        await connect()
                        break
                    } catch (error) {
                        console.error('[RECONEXÃO] Falha ao criar conexão:', error)
                        await new Promise(r => setTimeout(r, MAX_RECONNECT_DELAY_MS))
                    }
                }
            }
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

        // Inserções e atualizações podem conter nomes/IDs e ambos devem ser persistidos.
        if (events['contacts.upsert']) {
            const contacts = events['contacts.upsert']
            if (isBotReady) await contactsUpdate(contacts)
            else queueEvent(eventsCache, 'contacts.upsert', contacts)
        }
        if (events['contacts.update']){
            const contacts = events['contacts.update']
            if (isBotReady) await contactsUpdate(contacts)
            else queueEvent(eventsCache, 'contacts.update', contacts)
        }

        if (events['chats.update']){
            await logNewsletterChatUpdates(events['chats.update'])
        }

        const newsletterMetaUpdates = (events as Record<string, unknown>)['newsletters.update'] as NewsletterUpdate[] | undefined
        if (newsletterMetaUpdates){
            await logNewslettersUpdate(newsletterMetaUpdates)
        }
    })
    activeClient = client
}
