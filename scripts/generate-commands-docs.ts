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
    usage: string
    description: string
    permission: string
}

function extractUsageAndDescription(guide: string): { usage: string; description: string } {
    const lines = guide.split('\n').filter(l => l.trim())
    
    const examples: string[] = []
    const observations: string[] = []
    const otherLines: string[] = []
    
    for (const line of lines) {
        const cleanLine = line.trim()
        if (cleanLine.startsWith('Ex:')) {
            // Remover "Ex:" e limpar placeholders para formato legível
            const exampleText = cleanLine
                .replace(/^Ex:\s*/i, '')
                .replace(/\*\{(\$p|\$\d+)\}\*/g, '!')
                .replace(/\{(\$p|\$\d+)\}/g, '!')
                .trim()
            if (exampleText) examples.push(exampleText)
        } else if (cleanLine.startsWith('*Obs*:')) {
            observations.push(cleanLine.replace(/^\*Obs\*:\s*/i, 'OBS: '))
        } else if (cleanLine.length > 0) {
            const cleaned = cleanLine
                .replace(/\*\{(\$p|\$\d+)\}\*/g, '!')
                .replace(/\{(\$p|\$\d+)\}/g, '!')
                .trim()
            if (cleaned) otherLines.push(cleaned)
        }
    }
    
    // Montar uso com todos os exemplos em formato de lista
    const usage = examples.length > 0 ? examples.join('\n  • ') : 'Sem exemplos de uso'
    
    // Montar descrição com contexto adicional e observações
    const descParts = [...otherLines, ...observations]
    const description = descParts.join(' ') || 'Comando do bot'
    
    return { usage, description }
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
        const { usage, description } = extractUsageAndDescription(data.guide)
        allCommands.push({
            command: cmd,
            category: 'INFORMAÇÃO',
            usage,
            description,
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
        
        const { usage, description } = extractUsageAndDescription(data.guide)
        allCommands.push({
            command: cmd,
            category,
            usage,
            description,
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Processar comandos de GRUPO
    for (const [cmd, data] of Object.entries(groupCommands as Commands)) {
        const { usage, description } = extractUsageAndDescription(data.guide)
        allCommands.push({
            command: cmd,
            category: 'GRUPO',
            usage,
            description,
            permission: getPermissionLabel(data.permissions)
        })
    }
    
    // Processar comandos de ADMIN
    for (const [cmd, data] of Object.entries(adminCommands as Commands)) {
        const { usage, description } = extractUsageAndDescription(data.guide)
        allCommands.push({
            command: cmd,
            category: 'ADMINISTRAÇÃO',
            usage,
            description,
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
                content += `USO:\n  • ${cmd.usage}\n`
                if (cmd.description && cmd.description !== 'Comando do bot') {
                    content += `DETALHES: ${cmd.description}\n`
                }
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
