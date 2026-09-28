import { storedTransportMessage } from './infrastructure/incoming-messages.js'
import { cachedGroup } from './infrastructure/group-metadata.js'
import { pino } from 'pino'
import { isJidBroadcast, AuthenticationState, WAVersion, UserFacingSocketConfig, Browsers } from '@whiskeysockets/baileys'
import NodeCache from 'node-cache'
import { getMessageFromCache } from './utils/whatsapp.util.js'

export default function configSocket (state : AuthenticationState, retryCache : NodeCache, version: WAVersion | undefined, messageCache: NodeCache){
    const config : UserFacingSocketConfig =  {
        auth: state,
        msgRetryCounterCache : retryCache,
        defaultQueryTimeoutMs: 45000,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        qrTimeout: undefined,
        logger: pino({level: 'silent'}),
        browser: Browsers.ubuntu('Elisyum Bot'),
        shouldIgnoreJid: jid => isJidBroadcast(jid) || jid?.endsWith('@newsletter'),
        cachedGroupMetadata: async jid => cachedGroup(jid),
        getMessage: async (key) => {
            const message = (key.id) ? getMessageFromCache(key.id, messageCache) : undefined
            return message || (key.id && key.remoteJid ? await storedTransportMessage(key.remoteJid,key.id) : undefined)
        }
    }

    if (version) {
        config.version = version
    }

    return config
}