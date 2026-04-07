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
        getMessage: async (key) => {
            const message = (key.id) ? getMessageFromCache(key.id, messageCache) : undefined
            return message
        }
    }

    if (version) {
        config.version = version
    }

    return config
}