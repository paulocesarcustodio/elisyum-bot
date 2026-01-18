import Fuse from 'fuse.js'
import infoCommands from '../commands/info.list.commands.js'
import utilityCommands from '../commands/utility.list.commands.js'
import groupCommands from '../commands/group.list.commands.js'
import adminCommands from '../commands/admin.list.commands.js'

interface CommandItem {
    name: string
    category: 'info' | 'utility' | 'group' | 'admin'
}

/**
 * Obtém lista de todos os comandos disponíveis
 */
function getAllCommands(): CommandItem[] {
    const commands: CommandItem[] = []
    
    // Info commands
    Object.keys(infoCommands).forEach(name => {
        commands.push({ name, category: 'info' })
    })
    
    // Utility commands
    Object.keys(utilityCommands).forEach(name => {
        commands.push({ name, category: 'utility' })
    })
    
    // Group commands
    Object.keys(groupCommands).forEach(name => {
        commands.push({ name, category: 'group' })
    })
    
    // Admin commands
    Object.keys(adminCommands).forEach(name => {
        commands.push({ name, category: 'admin' })
    })
    
    return commands
}

/**
 * Calcula similaridade básica entre strings (caracteres em comum)
 */
function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    let matches = 0
    for (let char of shorter) {
        if (longer.includes(char)) {
            matches++
        }
    }
    
    return matches / longer.length
}

/**
 * Busca comando similar usando fuzzy search
 * @param commandName Nome do comando digitado pelo usuário (sem prefixo)
 * @param threshold Limite de similaridade (0.0 = exato, 1.0 = qualquer coisa) - padrão 0.5
 * @returns Comando mais similar encontrado ou null
 */
export function findSimilarCommand(commandName: string, threshold: number = 0.5): CommandItem | null {
    console.log(`[FUZZY] 🔍 Buscando similar para: "${commandName}"`)
    
    const allCommands = getAllCommands()
    console.log(`[FUZZY] 📚 Total de comandos disponíveis: ${allCommands.length}`)
    
    const fuse = new Fuse(allCommands, {
        keys: ['name'],
        threshold: threshold,
        distance: 100,
        includeScore: true,
        // Configurações otimizadas para detectar typos
        ignoreLocation: true,
        minMatchCharLength: 1,  // Alterado de 2 para 1 para aceitar comandos de 1 letra
        shouldSort: true
    })
    
    const results = fuse.search(commandName)
    
    console.log(`[FUZZY] 🎯 Resultados encontrados: ${results.length}`)
    
    // Debug logging
    if (results.length > 0) {
        console.log(`[FUZZY] Top 3 matches para "${commandName}":`)
        results.slice(0, 3).forEach((r, i) => {
            console.log(`  ${i + 1}. "${r.item.name}" (score: ${r.score?.toFixed(3)}, categoria: ${r.item.category})`)
        })
    }
    
    // Retorna o melhor match se houver
    if (results.length > 0 && results[0].score !== undefined && results[0].score <= threshold) {
        const match = results[0].item
        
        // Para comandos de exatamente 1 caractere (d, s), usar regras muito estritas
        // Typos em comandos de 1 letra são raros - geralmente você acerta ou erra
        if (match.name.length === 1) {
            // Aceitar apenas se for exatamente igual ou score muito baixo (< 0.2)
            if (results[0].score > 0.2) {
                console.log(`[FUZZY] ⚠️ Match rejeitado para comando de 1 char: "${commandName}" vs "${match.name}" (score: ${results[0].score.toFixed(3)})`)
                return null
            }
        } else if (match.name.length === 2 && commandName.length <= 3) {
            // Para comandos de 2 caracteres, aceitar typos simples (score < 0.4)
            if (results[0].score > 0.4) {
                console.log(`[FUZZY] ⚠️ Match rejeitado para comando de 2 chars: "${commandName}" vs "${match.name}" (score: ${results[0].score.toFixed(3)})`)
                return null
            }
        } else {
            // Para comandos normais (3+ caracteres), validar similaridade de caracteres
            // Isso evita falsos positivos como "hello" → "welcome"
            const similarity = calculateSimilarity(commandName.toLowerCase(), match.name.toLowerCase())
            
            if (similarity < 0.6) {
                console.log(`[FUZZY] ⚠️ Match rejeitado por baixa similaridade: "${commandName}" vs "${match.name}" (${(similarity * 100).toFixed(0)}%)`)
                return null
            }
        }
        
        console.log(`[FUZZY] ✅ Match encontrado: "${commandName}" → "${match.name}" (score: ${results[0].score.toFixed(3)})`)
        return match
    }
    
    console.log(`[FUZZY] ❌ Nenhum match encontrado para "${commandName}"`)
    return null
}

/**
 * Verifica se comando existe exatamente
 */
export function commandExists(commandName: string): boolean {
    const allCommands = getAllCommands()
    return allCommands.some(cmd => cmd.name === commandName)
}
