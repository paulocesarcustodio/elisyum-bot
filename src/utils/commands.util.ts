import type { CategoryCommand } from '../interfaces/command.interface.js'
import { commandCatalog, findCommand } from '../application/command-catalog.js'
import botTexts from '../helpers/bot.texts.helper.js'
import { buildText } from './general.util.js'

export function commandExist(prefix: string, command: string, category?: CategoryCommand) {
    if (!command.startsWith(prefix)) return false
    const definition = findCommand(command.slice(prefix.length))
    return !!definition && (!category || definition.category === category)
}
export function getCommands(prefix: string) {
    return commandCatalog().map(command => prefix + command.name)
}
export function getCommandsByCategory(prefix: string, category: CategoryCommand) {
    return commandCatalog().filter(command => command.category === category).map(command => prefix + command.name)
}
export const getCommandRegistry = commandCatalog
export const getCommandDefinition = findCommand
export function getCommandCategory(prefix: string, command: string) {
    return command.startsWith(prefix) ? findCommand(command.slice(prefix.length))?.category ?? null : null
}
export function getCommandGuide(prefix: string, command: string) {
    const definition = command.startsWith(prefix) ? findCommand(command.slice(prefix.length)) : undefined
    return buildText(definition ? botTexts.guide_header_text + definition.guide : botTexts.no_guide_found).replaceAll('!comando', prefix + 'comando')
}
