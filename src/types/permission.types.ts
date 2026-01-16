/**
 * Sistema de Permissões Simplificado
 * 
 * Estrutura hierárquica de 3 roles:
 * - OWNER: Dono único do bot (primeiro a registrar com !admin)
 * - GROUP_MODERATOR: Administrador do grupo no WhatsApp
 * - MEMBER: Membro comum do grupo
 * 
 * Empilhamento hierárquico:
 * - OWNER tem todas permissões de GROUP_MODERATOR + MEMBER
 * - GROUP_MODERATOR tem todas permissões de MEMBER
 * - MEMBER tem acesso apenas a comandos públicos
 */

export enum Role {
    OWNER = 'owner',
    GROUP_MODERATOR = 'group_moderator',
    MEMBER = 'member'
}

export type RoleString = 'owner' | 'group_moderator' | 'member'

/**
 * Interface para declaração de permissões em comandos
 */
export interface CommandPermissions {
    /**
     * Lista de roles que podem executar o comando.
     * Se vazio ou undefined, o comando é público (todos podem usar).
     * Usa lógica OR: usuário precisa ter pelo menos 1 dos roles listados.
     * 
     * Exemplos:
     * - ['owner'] = apenas o dono
     * - ['owner', 'group_moderator'] = dono ou admins do grupo
     * - undefined = todos (público)
     */
    roles?: RoleString[]
}
