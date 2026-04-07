export const COMMAND_ALIASES: Record<string, string> = {
    p: 'play',
    a: 'audio',
    'á': 'audio',
    'áudio': 'audio',
    'áudios': 'audios'
}

export function resolveCommandAlias(commandName: string) {
    return COMMAND_ALIASES[commandName] || commandName
}