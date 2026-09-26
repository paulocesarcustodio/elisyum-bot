import infoCommands from '../commands/info.list.commands.js'
import utilityCommands from '../commands/utility.list.commands.js'
import groupCommands from '../commands/group.list.commands.js'
import adminCommands from '../commands/admin.list.commands.js'
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

function commandEntries(category: CategoryCommand, commands: Record<string, any>): SemanticCommand[] {
    return Object.entries(commands).map(([name, command]) => {
        const annotated = command.semantic
        const family = semanticFamily(category, name)
        const description = annotated?.description || command.guide
            .replace(/\*\{\$p\}[^\n]*/g, ' ')
            .replace(/\{\$[^}]+\}/g, ' ')
            .replace(/[\n*`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        return {
            name,
            category,
            family,
            description: annotated?.naturalCommand === false ? '' : description,
            examples: annotated?.examples ?? [],
            roles: command.permissions?.roles,
            destructive: /^(ban|addlista|promover|rebaixar|fotogrupo|restrito|antilink|antifake|antiflood|autosticker|apg|bloquear|desbloquear|sair|sairgrupos|desligar|bcmd|dcmd|bcmdglobal|dcmdglobal|taxacomandos|comandospv|autostickerpv|prefixo|nomebot|fotobot|recado|entrargrupo|grupo|silenciar|autoresp|addresp|rmresp|addfiltros|rmfiltros|addexlink|rmexlink|addexfake|rmexfake|add|rlink|save|delete|rename)$/.test(name),
            replyContext: category === 'utility' && ['s', 'simg', 'mp3', 'play', 'v', 'save'].includes(name)
                ? 'media'
                : category === 'group' && ['ban', 'silenciar', 'aviso', 'rmaviso', 'promover', 'rebaixar', 'addlista', 'vtnc'].includes(name)
                    ? 'target'
                    : 'none'
        }
    })
}

function semanticFamily(category: CategoryCommand, name: string): string {
    if (category !== 'group') return category
    if (['grupo', 'listanegra', 'adms', 'dono', 'link', 'topativos', 'membro', 'inativos'].includes(name)) return 'group_information'
    if (['aviso', 'silenciar', 'rmaviso', 'addlista', 'rmlista', 'add', 'ban', 'promover', 'rebaixar', 'mt', 'mm', 'vtnc'].includes(name)) return 'group_members'
    if (['fotogrupo', 'apg'].includes(name)) return 'group_media'
    if (['autoresp', 'addresp', 'rmresp', 'respostas'].includes(name)) return 'group_auto_reply'
    if (['antilink', 'addexlink', 'rmexlink', 'antifake', 'addexfake', 'rmexfake', 'antiflood', 'restrito'].includes(name)) return 'group_protection'
    if (['bcmd', 'dcmd'].includes(name)) return 'group_command_access'
    if (['autosticker', 'bemvindo', 'zeraravisos', 'addfiltros', 'rmfiltros', 'rlink'].includes(name)) return 'group_configuration'
    return 'group_settings'
}

export const semanticCommands: SemanticCommand[] = [
    ...commandEntries('info', infoCommands),
    ...commandEntries('utility', utilityCommands),
    ...commandEntries('group', groupCommands),
    ...commandEntries('admin', adminCommands)
].filter(command => command.description.length > 0)

const semanticByName = new Map(semanticCommands.map(command => [command.name, command]))

export function getSemanticCommand(name: string) {
    return semanticByName.get(resolveCommandAlias(name))
}

export function getSemanticCommandsForContext(isGroup: boolean): SemanticCommand[] {
    return semanticCommands.filter(command => {
        if (command.category === 'group' && !isGroup) return false
        if (command.category === 'admin' && !isGroup) return false
        return true
    })
}
