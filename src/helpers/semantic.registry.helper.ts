import { commandCatalog } from '../application/command-catalog.js'
import type { CategoryCommand } from '../interfaces/command.interface.js'
import { resolveCommandAlias } from '../utils/command.aliases.util.js'

export interface SemanticCommand {
    name: string
    category: CategoryCommand
    family: string
    description: string
    examples: string[]
    roles?: string[]
    destructive: boolean
    replyContext: 'target' | 'media' | 'none'
}

export const semanticCommands: SemanticCommand[] = commandCatalog()
    .filter(command => command.naturalCommand)
    .map(command => ({
        name:command.name, category:command.category, family:command.family,
        description:command.description, examples:command.examples, roles:command.roles,
        destructive:command.confirmation, replyContext:command.replyContext
    }))

const semanticByName = new Map(semanticCommands.map(command => [command.name, command]))

export function getSemanticCommand(name: string) {
    return semanticByName.get(resolveCommandAlias(name))
}

export function getSemanticCommandsForContext(isGroup: boolean): SemanticCommand[] {
    return semanticCommands.filter(command => {
        if (command.category === 'group' && !isGroup) return false
        if (command.category === 'admin' && isGroup) return false
        return true
    })
}
