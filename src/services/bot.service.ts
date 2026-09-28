import type { Bot } from '../interfaces/bot.interface.js'
import { db } from '../database/client.js'
import { BOT_PREFIX } from '../constants.js'
import { normalizeWhatsappJid } from '../utils/whatsapp.util.js'

const accountId = () => process.env.BOT_ACCOUNT_ID || 'default'
const defaults:Bot={
    started:0,host_number:'',name:'Ξ ʟ ʏ s ɪ ᴜ ᴍ  ɮ ᴏ ᴛ™',prefix:BOT_PREFIX,executed_cmds:0,
    db_migrated:true,db_migration_version:3,autosticker:false,commands_pv:true,semantic_commands:false,
    block_cmds:[],command_rate:{status:false,max_cmds_minute:5,block_time:60}
}
let instance:BotService | undefined
export class BotService {
    private bot:Bot=structuredClone(defaults)
    private ready:Promise<void> | undefined
    private pending:Promise<void>=Promise.resolve()
    private failure:unknown
    constructor(){if(instance)return instance;instance=this}
    public initialize():Promise<void> {
        return this.ready ||= (async()=>{
            await db.prepare('INSERT INTO bot_accounts (id,config) VALUES (?,?::jsonb) ON CONFLICT(id) DO NOTHING').run(accountId(),JSON.stringify(defaults))
            const row=await db.prepare('SELECT config FROM bot_accounts WHERE id=?').get(accountId())
            this.bot={...structuredClone(defaults),...row.config,command_rate:{...defaults.command_rate,...row.config.command_rate}}
            this.bot.prefix ||= BOT_PREFIX
        })()
    }
    private persist(patch:Partial<Bot>):Promise<void> {
        Object.assign(this.bot,patch)
        const result=this.pending.then(async()=>{
            await this.initialize()
            await db.prepare('UPDATE bot_accounts SET config=config || ?::jsonb,updated_at=now() WHERE id=?').run(JSON.stringify(patch),accountId())
            this.failure=undefined
        })
        this.pending=result.catch(error=>{this.failure=error})
        return result
    }
    public async persistOnExit(){await this.pending;if(this.failure)throw this.failure}
    public async startBot(hostNumber:string){await this.initialize();await this.persist({started:Date.now(),host_number:normalizeWhatsappJid(hostNumber)})}
    public async migrateBot(){await this.initialize();await this.persist(this.bot)}
    public getBot(){return this.bot}
    public async setDbMigrated(status:boolean){await this.initialize();await this.persist({db_migrated:status,db_migration_version:status?3:this.bot.db_migration_version})}
    public async incrementExecutedCommands(){
        await this.initialize()
        const row=await db.prepare("UPDATE bot_accounts SET config=jsonb_set(config,'{executed_cmds}',to_jsonb(COALESCE((config->>'executed_cmds')::integer,0)+1)),updated_at=now() WHERE id=? RETURNING (config->>'executed_cmds')::integer AS count").get(accountId())
        this.bot.executed_cmds=row.count
    }
    public async setCommandsPv(status:boolean){await this.initialize();await this.persist({commands_pv:status})}
    public async setCommandRate(status:boolean,maxCommandsMinute:number,blockTime:number){await this.initialize();await this.persist({command_rate:{status,max_cmds_minute:maxCommandsMinute,block_time:blockTime}})}
}
