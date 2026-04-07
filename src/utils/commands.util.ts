
import { Bot } from "../interfaces/bot.interface.js"
import {CategoryCommand, Commands } from "../interfaces/command.interface.js"
import infoCommands from "../commands/info.list.commands.js"
import utilityCommands from "../commands/utility.list.commands.js"
import groupCommands from "../commands/group.list.commands.js"
import adminCommands from "../commands/admin.list.commands.js"
import botTexts from "../helpers/bot.texts.helper.js"
import { removePrefix } from "./whatsapp.util.js"
import { buildText } from "./general.util.js"
import { resolveCommandAlias } from "./command.aliases.util.js"

const COMMAND_CATEGORIES = ['info', 'utility', 'group', 'admin']

export function commandExist(prefix: string, command: string, category? : CategoryCommand){
    const commandName = resolveCommandAlias(removePrefix(prefix, command))
    const resolvedCommand = prefix + commandName

    if (!category) {
        return getCommands(prefix).includes(resolvedCommand)
    } else {
        return getCommandsByCategory(prefix, category).includes(resolvedCommand)
    }
}

export function getCommands(prefix: string){
    const commands = [
        ...Object.keys(utilityCommands),
        ...Object.keys(infoCommands),
        ...Object.keys(groupCommands),
        ...Object.keys(adminCommands),
    ].map(command => prefix+command)
    
    return commands
}

export function getCommandsByCategory(prefix: string, category: CategoryCommand){
    switch(category){
        case 'info':
            return Object.keys(infoCommands).map(command => prefix+command)
        case 'utility':
            return Object.keys(utilityCommands).map(command => prefix+command)
        case 'group':
            return Object.keys(groupCommands).map(command => prefix+command)
        case 'admin':
            return Object.keys(adminCommands).map(command => prefix+command)
    }
}

export function getCommandCategory(prefix: string, command: string){
    let foundCategory : CategoryCommand | null = null
    const categories = COMMAND_CATEGORIES as CategoryCommand[]
    const commandName = removePrefix(prefix, command)
    
    // Verifica se existe alias
    const resolvedCommand = resolveCommandAlias(commandName)
    const resolvedFullCommand = prefix + resolvedCommand

    for (let category of categories){
        if (getCommandsByCategory(prefix, category).includes(resolvedFullCommand)) {
            foundCategory = category as CategoryCommand
        }
    }

    return foundCategory
}

export function getCommandGuide(prefix: string, command: string){
    const commandCategory = getCommandCategory(prefix, command)
    const {guide_header_text, no_guide_found} = botTexts
    let guide_text : string
    const resolvedCommand = resolveCommandAlias(removePrefix(prefix, command))

    switch(commandCategory){
        case 'info':
            const info = infoCommands as Commands
            guide_text = guide_header_text + info[resolvedCommand].guide
            break
        case 'utility':
            const utility = utilityCommands as Commands
            guide_text = guide_header_text + utility[resolvedCommand].guide
            break
        case 'group':
            const group = groupCommands as Commands
            guide_text = guide_header_text + group[resolvedCommand].guide
            break
        case 'admin':
            const admin = adminCommands as Commands
            guide_text = guide_header_text + admin[resolvedCommand].guide
            break
        default:
            guide_text = no_guide_found
    }

    return buildText(guide_text)
}