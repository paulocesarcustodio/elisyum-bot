import { WASocket } from "@whiskeysockets/baileys"
import { Bot } from "./bot.interface.js"
import { Message } from "./message.interface.js"
import { Group } from "./group.interface.js"
import { CommandPermissions } from "../types/permission.types.js"

export type CategoryCommand = "info" | "utility" | "group" | "admin"
type CommandFunction = (client: WASocket, botInfo: Bot, message: Message, group?: Group) => Promise<void>

export type Commands = {
    [command_name : string] : {
        guide: string,
        permissions?: CommandPermissions,
        msgs?: {
            [message_type : string] : string | string[]
        }
        function: CommandFunction
    }
}

export type CommandsList = {
    [category in CategoryCommand]: Commands
}



