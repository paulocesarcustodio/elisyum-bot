import { db } from '../database/client.js'
import { consumeConfirmation } from './confirmations.js'
import type { CommandPolicy, CommandRequest, CommandResult } from '../domain/contracts.js'

export class CommandRejected extends Error {
    readonly code = 'COMMAND_REJECTED'
}

export function validateCommandRequest(request: CommandRequest, definition: CommandPolicy): void {
    if (request.command !== definition.name) throw new CommandRejected('Comando inválido.')
    if (!definition.contexts.includes(request.kind)) throw new CommandRejected('Este comando só pode ser usado em um grupo.')
    if (definition.roles.length && !definition.roles.some(role => request.actor.roles.includes(role))) {
        throw new CommandRejected('Você não tem permissão para executar este comando.')
    }
    if (request.args.length > 64 || request.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0'))) {
        throw new CommandRejected('Os argumentos do comando são inválidos ou muito longos.')
    }
    if (request.source !== 'prefix' && definition.confirmation && !request.confirmationId) {
        throw new CommandRejected('Esta ação precisa de confirmação.')
    }
}

/** All adapters enter through the same policy check before invoking a use case. */
export async function executeCommand(request: CommandRequest, definition: CommandPolicy, action: () => Promise<void>, authorize: () => Promise<void>): Promise<CommandResult> {
    validateCommandRequest(request, definition)
    await authorize()
    await db.prepare('UPDATE command_operations SET command=?,request=?,updated_at=now() WHERE id=?').run(request.command,JSON.stringify(request),request.operationId)
    if(request.source!=='prefix' && definition.confirmation && !await consumeConfirmation(request))throw new CommandRejected('A confirmação venceu, já foi usada ou não corresponde a esta ação.')
    await action()
    return {status:'succeeded', operationId:request.operationId}
}
