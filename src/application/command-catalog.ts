import info from '../commands/info.list.commands.js'
import utility from '../commands/utility.list.commands.js'
import group from '../commands/group.list.commands.js'
import admin from '../commands/admin.list.commands.js'
import type { Commands } from '../interfaces/command.interface.js'
import type { CommandCategory, CommandPolicy, Role } from '../domain/contracts.js'
import { COMMAND_ALIASES, resolveCommandAlias } from '../utils/command.aliases.util.js'
import { semanticDescriptions } from '../helpers/semantic.descriptions.js'

export type CatalogCommand = Commands[string] & CommandPolicy
const changesState = new Set(['ban','addlista','rmlista','promover','rebaixar','apg','bloquear','desbloquear','taxacomandos','comandospv','silenciar','add','save','delete','rename'])
const mediaContext = new Set(['s','simg','mp3','save','revelar'])
const targetContext = new Set(['ban','silenciar','promover','rebaixar','addlista','vtnc','v'])

// Built lazily because legacy command handlers also call the catalog for help.
export function commandCatalog(): CatalogCommand[] {
    const categories: Record<CommandCategory, Commands> = {info: info as Commands, utility: utility as Commands, group: group as Commands, admin: admin as Commands}
    return Object.entries(categories).flatMap(([category, commands]) => Object.entries(commands).map(([name, command]) => ({
        ...command,
        name,
        category: category as CommandCategory,
        aliases: Object.entries(COMMAND_ALIASES).filter(([,target]) => target === name).map(([alias]) => alias),
        roles: command.permissions?.roles ?? [] as Role[],
        contexts: category === 'group' ? ['group'] as const : ['private','group'] as const,
        description: semanticDescriptions[name] || command.semantic?.description || name,
        examples: command.semantic?.examples ?? [],
        naturalCommand: command.semantic?.naturalCommand !== false,
        confirmation: changesState.has(name),
        replyContext: mediaContext.has(name) ? 'media' as const : targetContext.has(name) ? 'target' as const : 'none' as const,
        family: category !== 'group' ? category : name === 'listanegra' ? 'group_information' : name === 'apg' ? 'group_media' : 'group_members'
    } as CatalogCommand)))
}
export function findCommand(name: string): CatalogCommand | undefined {
    const canonical = resolveCommandAlias(name.toLowerCase())
    return commandCatalog().find(command => command.name === canonical)
}
