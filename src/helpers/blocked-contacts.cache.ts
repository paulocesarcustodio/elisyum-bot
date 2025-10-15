import NodeCache from "node-cache"

const BLOCKED_CONTACTS_CACHE_KEY = "blockedContacts"

const blockedContactsCache = new NodeCache({ stdTTL: 30, checkperiod: 5 })

export function getBlockedContactsFromCache(){
    return blockedContactsCache.get<string[]>(BLOCKED_CONTACTS_CACHE_KEY)
}

export function setBlockedContactsCache(contacts: string[]){
    blockedContactsCache.set(BLOCKED_CONTACTS_CACHE_KEY, contacts)
}

export function clearBlockedContactsCache(){
    blockedContactsCache.del(BLOCKED_CONTACTS_CACHE_KEY)
}
