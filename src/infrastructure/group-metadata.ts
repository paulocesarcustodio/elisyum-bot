import type { GroupMetadata } from '@whiskeysockets/baileys'
const metadata=new Map<string,{value:GroupMetadata;expires:number}>()
export function cacheGroup(value:GroupMetadata){
    metadata.set(value.id,{value,expires:Date.now()+60_000})
    if(metadata.size>1000)metadata.delete(metadata.keys().next().value!)
    return value
}
export function cachedGroup(id:string){const item=metadata.get(id);return item && item.expires>Date.now()?item.value:undefined}
export function invalidateGroup(id:string){metadata.delete(id)}
