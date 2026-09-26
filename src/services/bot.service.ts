import { Bot } from "../interfaces/bot.interface.js"
import path from "node:path"
import fs from 'fs-extra'
import moment from "moment-timezone"
import { removePrefix, normalizeWhatsappJid } from "../utils/whatsapp.util.js"
import { deepMerge } from "../utils/general.util.js"
import { BOT_PREFIX } from "../constants.js"

const CURRENT_DB_MIGRATION_VERSION = 3

let botServiceInstance: BotService | null = null

export class BotService {
    private pathJSON = path.resolve("storage/bot.json")
    private bot!: Bot
    private persistTimer: ReturnType<typeof setTimeout> | null = null
    private persistScheduled = false

    private defaultBot : Bot = {
        started : 0,
        host_number: '',
        name: "Ξ ʟ ʏ s ɪ ᴜ ᴍ  ɮ ᴏ ᴛ™",
        prefix: BOT_PREFIX,
        executed_cmds: 0,
        db_migrated: true,
        db_migration_version: CURRENT_DB_MIGRATION_VERSION,
        autosticker: false,
        commands_pv: true,
        semantic_commands: false,
        block_cmds: [],
        command_rate:{
            status: false,
            max_cmds_minute: 5,
            block_time: 60,
        }
    }

    constructor(){
        if (botServiceInstance) {
            return botServiceInstance as unknown as BotService
        }

        const storageFolderExists = fs.pathExistsSync(path.resolve("storage"))
        const jsonFileExists = fs.existsSync(this.pathJSON)
        
        if (!storageFolderExists) fs.mkdirSync(path.resolve("storage"), {recursive: true})
        if (!jsonFileExists) {
            this.initBot()
        } else {
            this.bot = JSON.parse(fs.readFileSync(this.pathJSON, {encoding: "utf-8"})) as Bot
        }

        const currentMigrationVersion = this.bot.db_migration_version ?? 0
        const requiresMigration = currentMigrationVersion < CURRENT_DB_MIGRATION_VERSION
        if (requiresMigration) {
            this.bot.db_migrated = false
            this.bot.db_migration_version = currentMigrationVersion
        }

        this.bot.prefix = BOT_PREFIX
        botServiceInstance = this
    }

    private initBot(){
        this.bot = { ...this.defaultBot }
        this.persistNow()
    }

    private schedulePersist() {
        if (this.persistScheduled) return
        this.persistScheduled = true
        this.persistTimer = setTimeout(() => {
            this.persistNow()
            this.persistScheduled = false
            this.persistTimer = null
        }, 5000)
    }

    private persistNow() {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer)
            this.persistTimer = null
        }
        this.persistScheduled = false
        fs.writeFile(this.pathJSON, JSON.stringify(this.bot))
    }

    public persistOnExit() {
        this.persistNow()
    }

    public migrateBot() {
        this.bot = deepMerge(this.defaultBot, this.bot as any) as Bot
        this.schedulePersist()
    }

    public startBot(hostNumber : string){
        this.bot.started = moment.now()
        this.bot.host_number = normalizeWhatsappJid(hostNumber)
        this.schedulePersist()
    }

    public getBot(){
        const normalizedHostNumber = normalizeWhatsappJid(this.bot.host_number)
        if (this.bot.host_number !== normalizedHostNumber) {
            this.bot.host_number = normalizedHostNumber
            this.schedulePersist()
        }
        return this.bot
    }

    public setNameBot(name: string){
        this.bot.name = name
        this.schedulePersist()
    }

    public setDbMigrated(status: boolean) {
        this.bot.db_migrated = status
        this.bot.db_migration_version = status ? CURRENT_DB_MIGRATION_VERSION : this.bot.db_migration_version ?? 0
        this.schedulePersist()
    }
    
    public setPrefix(prefix: string){
        console.warn('[BOT] ⚠️ Tentativa de alterar prefixo ignorada. Prefixo é hardcoded como "!"')
    }

    public incrementExecutedCommands(){
        this.bot.executed_cmds++
        this.schedulePersist()
    }

    public setAutosticker(status: boolean){
        this.bot.autosticker = status
        this.schedulePersist()
    }

    public setCommandsPv(status: boolean){
        this.bot.commands_pv = status
        this.schedulePersist()
    }

    public async setCommandRate(status: boolean, maxCommandsMinute: number, blockTime: number){
        this.bot.command_rate.status = status
        this.bot.command_rate.max_cmds_minute = maxCommandsMinute
        this.bot.command_rate.block_time = blockTime
        this.schedulePersist()
    }

    public async setBlockedCommands(prefix: string, commands: string[], operation: 'add' | 'remove'){
        const commandsWithoutPrefix = commands.map(command => removePrefix(prefix, command))

        if (operation == 'add'){
            const blockCommands = commandsWithoutPrefix.filter(command => !this.bot.block_cmds.includes(command))
            this.bot.block_cmds.push(...blockCommands)
            this.schedulePersist()
            return blockCommands.map(command => prefix+command)
        } else {
            const unblockCommands = commandsWithoutPrefix.filter(command => this.bot.block_cmds.includes(command))

            unblockCommands.forEach((command) => {
                this.bot.block_cmds.splice(this.bot.block_cmds.indexOf(command), 1)
            })

            this.schedulePersist()
            return unblockCommands.map(command => prefix+command)
        }
    }
}
