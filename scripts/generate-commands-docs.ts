import infoCommands from '../src/commands/info.list.commands.js'
import utilityCommands from '../src/commands/utility.list.commands.js'
import groupCommands from '../src/commands/group.list.commands.js'
import adminCommands from '../src/commands/admin.list.commands.js'
import { Commands } from '../src/interfaces/command.interface.js'
import fs from 'node:fs'
import path from 'node:path'

interface CommandDoc {
    command: string
    category: string
    description: string
    permission: string
}

function extractDescription(guide: string): string {
    const lines = guide.split('\n').filter(l => l.trim())
    const descriptions = lines
        .filter(line => !line.startsWith('Ex:') && !line.startsWith('*Obs*:'))
        .map(line => line.replace(/\*\{?\$?p?\}?\*/g, '').trim())
        .filter(line => line.length > 0)
    
    return descriptions.join(' ') || lines[0]?.replace(/Ex:\s*\*\{?\$?p?\}?\*\s*\w+\s*-?\s*/i, '').trim() || 'Sem descrição'
}

function getPermissionLabel(permissions?: { roles?: string[] }): string {
    if (!permissions || !permissions.roles) return 'Usuário'
    
    const roles = permissions.roles
    if (roles.includes('owner') && roles.includes('group_moderator')) {
        return 'Admin do Grupo ou Dono do Bot'
    }
    if (roles.includes('owner')) return 'Dono do Bot'
    if (roles.includes('group_moderator')) return 'Admin do Grupo'
    
    return 'Usuário'
}

function generateDocs() {
    const allCommands: CommandDoc[] = []
    
    // Processar comandos de INFO
    for (const [cmd, data] of Object.entries(infoCommands as Commands)) {
        allCommands.push({
            command: cmd,
            category: 'INFORMAÇÃO',
            description: extractDescription(data.guide),
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Processar comandos de UTILIDADE
    for (const [cmd, data] of Object.entries(utilityCommands as Commands)) {
        let category = 'UTILIDADE'
        const guide = data.guide.toLowerCase()
        
        if (guide.includes('download') || guide.includes('youtube') || guide.includes('instagram')) {
            category = 'DOWNLOAD'
        } else if (guide.includes('sticker') || guide.includes('figurinha')) {
            category = 'STICKER'
        } else if (cmd === 'vtnc') {
            category = 'VARIADO'
        }
        
        allCommands.push({
            command: cmd,
            category,
            description: extractDescription(data.guide),
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Processar comandos de GRUPO
    for (const [cmd, data] of Object.entries(groupCommands as Commands)) {
        allCommands.push({
            command: cmd,
            category: 'GRUPO',
            description: extractDescription(data.guide),
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Processar comandos de ADMIN
    for (const [cmd, data] of Object.entries(adminCommands as Commands)) {
        allCommands.push({
            command: cmd,
            category: 'ADMINISTRAÇÃO',
            description: extractDescription(data.guide),
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Separar comandos de usuário e admin
    const userCommands = allCommands.filter(cmd => cmd.permission === 'Usuário')
    const adminCommandsList = allCommands.filter(cmd => cmd.permission !== 'Usuário')
    
    // Gerar conteúdo dos arquivos
    const generateContent = (commands: CommandDoc[]) => {
        let content = 'COMANDOS DO BOT ELISYUM\n'
        content += '='.repeat(80) + '\n\n'
        
        const groupedByCategory: { [key: string]: CommandDoc[] } = {}
        commands.forEach(cmd => {
            if (!groupedByCategory[cmd.category]) {
                groupedByCategory[cmd.category] = []
            }
            groupedByCategory[cmd.category].push(cmd)
        })
        
        for (const [category, cmds] of Object.entries(groupedByCategory)) {
            content += `\n### ${category}\n`
            content += '-'.repeat(80) + '\n\n'
            
            cmds.forEach(cmd => {
                content += `COMANDO: !${cmd.command}\n`
                content += `CATEGORIA: ${cmd.category}\n`
                content += `DESCRIÇÃO: ${cmd.description}\n`
                content += `PERMISSÃO: ${cmd.permission}\n`
                content += '\n'
            })
        }
        
        content += '\n' + '='.repeat(80) + '\n'
        content += `Total de comandos: ${commands.length}\n`
        
        return content
    }
    
    // Criar diretório
    const docsDir = path.join(process.cwd(), 'docs', 'commands')
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true })
    }
    
    // Escrever arquivos
    const userContent = generateContent(userCommands)
    const adminContent = generateContent(adminCommandsList)
    
    fs.writeFileSync(path.join(docsDir, 'comandos-usuario.txt'), userContent, 'utf-8')
    fs.writeFileSync(path.join(docsDir, 'comandos-admin.txt'), adminContent, 'utf-8')
    
    console.log('✅ Documentação gerada com sucesso!')
    console.log(`📄 Comandos de usuário: ${userCommands.length}`)
    console.log(`📄 Comandos de admin: ${adminCommandsList.length}`)
    console.log(`📁 Arquivos salvos em: ${docsDir}`)
}

generateDocs()
