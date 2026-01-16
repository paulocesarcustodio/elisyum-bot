import { Message } from "../interfaces/message.interface.js"
import { Role, RoleString } from "../types/permission.types.js"

/**
 * Serviço centralizado de gerenciamento de permissões
 * 
 * Implementa sistema de 3 roles com empilhamento hierárquico:
 * - Owner (dono) tem todas as permissões
 * - Group Moderator (admin do grupo) tem permissões de moderação
 * - Member (membro comum) tem acesso a comandos públicos
 */
export class PermissionService {
    
    /**
     * Retorna os roles do usuário com empilhamento hierárquico
     * 
     * @param message Mensagem com informações do remetente
     * @returns Array de roles do usuário (empilhados do maior para o menor)
     */
    getUserRoles(message: Message): RoleString[] {
        // Owner tem todos os roles (empilhamento completo)
        if (message.isBotOwner) {
            return [Role.OWNER, Role.GROUP_MODERATOR, Role.MEMBER]
        }
        
        // Admin do grupo tem role de moderator + member
        if (message.isGroupAdmin) {
            return [Role.GROUP_MODERATOR, Role.MEMBER]
        }
        
        // Membro comum só tem role de member
        return [Role.MEMBER]
    }
    
    /**
     * Verifica se o usuário tem permissão para executar o comando
     * 
     * @param message Mensagem com informações do remetente
     * @param allowedRoles Roles permitidos para o comando (undefined = público)
     * @returns true se o usuário tem pelo menos um dos roles necessários
     */
    hasPermission(message: Message, allowedRoles?: RoleString[]): boolean {
        // Se não há restrição de roles, comando é público
        if (!allowedRoles || allowedRoles.length === 0) {
            return true
        }
        
        const userRoles = this.getUserRoles(message)
        
        // Verifica se o usuário tem pelo menos um dos roles necessários (lógica OR)
        return allowedRoles.some(allowedRole => userRoles.includes(allowedRole))
    }
    
    /**
     * Retorna o role principal do usuário (maior na hierarquia)
     * 
     * @param message Mensagem com informações do remetente
     * @returns Role principal do usuário
     */
    getPrimaryRole(message: Message): RoleString {
        if (message.isBotOwner) return Role.OWNER
        if (message.isGroupAdmin) return Role.GROUP_MODERATOR
        return Role.MEMBER
    }
}
