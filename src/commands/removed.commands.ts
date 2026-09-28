// Keep retired names out of automatic typo correction and obsolete help caches.
export const REMOVED_COMMAND_NAMES = [
    'dbstats', 'logs', 'erros', 'contatos', 'reportar', 'meusdados', 'info',
    'aviso', 'rmaviso', 'zeraravisos',
    'grupo', 'dono', 'topativos', 'membro', 'inativos', 'mt', 'mm', 'adms',
    'fotogrupo', 'link', 'rlink', 'restrito', 'autosticker', 'bemvindo', 'bcmd', 'dcmd',
    'autoresp', 'addresp', 'rmresp', 'respostas',
    'antilink', 'addexlink', 'rmexlink', 'antifake', 'addexfake', 'rmexfake',
    'antiflood', 'addfiltros', 'rmfiltros',
    'grupos', 'sair', 'sairgrupos', 'linkgrupo', 'entrargrupo', 'bcgrupos',
    'fotobot', 'nomebot', 'prefixo', 'recado', 'autostickerpv',
    'bcmdglobal', 'dcmdglobal', 'desligar', 'testkasino'
] as const

const removedCommands = new Set<string>(REMOVED_COMMAND_NAMES)

export function isRemovedCommand(name: string): boolean {
    return removedCommands.has(name.toLowerCase())
}
