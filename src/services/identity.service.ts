import type { IdentityResolver } from '../domain/contracts.js'
import { db } from '../database/client.js'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'

export class IdentityService implements IdentityResolver {
    private accountId=process.env.BOT_ACCOUNT_ID || 'default'
    async aliases(jid:string):Promise<string[]> {
        const normalized=normalizeWhatsappJid(jid)
        if(!normalized)return []
        const rows=await db.prepare(`SELECT a.alias,i.primary_jid FROM identity_aliases original
            JOIN identity_aliases a ON a.identity_id=original.identity_id AND a.account_id=original.account_id
            JOIN identities i ON i.id=original.identity_id
            WHERE original.account_id=? AND original.alias=? ORDER BY (a.alias=i.primary_jid) DESC,a.alias`).all(this.accountId,normalized)
        return [...new Set([...rows.map(row=>row.alias as string),normalized])]
    }
    async resolve(primary:string,alternates:string[]=[],source='whatsapp'):Promise<{id:string;primary:string;aliases:string[]}> {
        const aliases=[...new Set([primary,...alternates].map(normalizeWhatsappJid).filter(Boolean))]
        if(!aliases.length)throw new Error('An identity requires a transport identifier')
        return db.transaction(async()=>{
            // Short database-only transaction. The lock prevents concurrent alias splits.
            await db.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?,0))').get(`identity:${this.accountId}`)
            const existing=await db.prepare(`SELECT DISTINCT i.id,i.primary_jid,i.created_at,COALESCE(u.owner,0) AS owner
                FROM identity_aliases a JOIN identities i ON i.id=a.identity_id
                LEFT JOIN users u ON u.id=i.primary_jid
                WHERE a.account_id=? AND a.alias=ANY(?::text[]) ORDER BY owner DESC,i.created_at,i.id`).all(this.accountId,aliases)
            let target=existing[0]
            if(!target)target=await db.prepare('INSERT INTO identities(account_id,primary_jid) VALUES (?,?) RETURNING id,primary_jid').get(this.accountId,aliases[0])
            for(const duplicate of existing.slice(1)) {
                await db.prepare(`INSERT INTO role_grants(account_id,identity_id,scope,role)
                    SELECT account_id,?,scope,role FROM role_grants WHERE identity_id=? ON CONFLICT DO NOTHING`).run(target.id,duplicate.id)
                await db.prepare('UPDATE identity_aliases SET identity_id=? WHERE identity_id=?').run(target.id,duplicate.id)
                await db.prepare('DELETE FROM identities WHERE id=?').run(duplicate.id)
            }
            for(const alias of aliases)await db.prepare(`INSERT INTO identity_aliases(account_id,alias,identity_id,source)
                VALUES (?,?,?,?) ON CONFLICT(account_id,alias) DO UPDATE SET identity_id=excluded.identity_id,source=excluded.source,updated_at=now()`)
                .run(this.accountId,alias,target.id,source)
            return {id:target.id,primary:target.primary_jid,aliases:await this.aliases(target.primary_jid)}
        })
    }
}
export const identityService=new IdentityService()
