import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { join } from 'path'
import { aiConfig } from '../config/ai.config.js'
import { showConsoleLibraryError } from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'

// Cache para os documentos (carregar apenas uma vez)
let userDocsCache: string | null = null
let groupAdminDocsCache: string | null = null
let botOwnerDocsCache: string | null = null

function loadDocs(isBotOwner: boolean, isGroupAdmin: boolean): string {
    try {
        // Determinar qual cache e arquivo usar baseado nas permissões
        if (isBotOwner) {
            if (botOwnerDocsCache) {
                console.log('📦 [ASK] Usando cache de dono do bot')
                return botOwnerDocsCache
            }
            const filePath = join(process.cwd(), 'docs', 'commands', 'ai-friendly-owner.txt')
            console.log(`📁 [ASK] Carregando do disco: ${filePath}`)
            const content = readFileSync(filePath, 'utf-8')
            botOwnerDocsCache = content
            return content
        } else if (isGroupAdmin) {
            if (groupAdminDocsCache) {
                console.log('📦 [ASK] Usando cache de admin de grupo')
                return groupAdminDocsCache
            }
            const filePath = join(process.cwd(), 'docs', 'commands', 'ai-friendly-groupadmin.txt')
            console.log(`📁 [ASK] Carregando do disco: ${filePath}`)
            const content = readFileSync(filePath, 'utf-8')
            groupAdminDocsCache = content
            return content
        } else {
            if (userDocsCache) {
                console.log('📦 [ASK] Usando cache de usuário')
                return userDocsCache
            }
            const filePath = join(process.cwd(), 'docs', 'commands', 'ai-friendly-usuario.txt')
            console.log(`📁 [ASK] Carregando do disco: ${filePath}`)
            const content = readFileSync(filePath, 'utf-8')
            userDocsCache = content
            return content
        }
    } catch (error) {
        throw new Error('Documentação de comandos não encontrada. Execute: bun run scripts/generate-ai-friendly-docs.ts')
    }
}

export async function askGemini(question: string, isBotOwner: boolean, isGroupAdmin: boolean): Promise<string> {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    
    if (!apiKey) {
        throw new Error('GOOGLE_AI_API_KEY não configurada. Configure no arquivo .env')
    }
    
    try {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: aiConfig.model,
            generationConfig: aiConfig.generationConfig,
            systemInstruction: aiConfig.systemInstruction
        })
        
        // Carregar documentação apropriada baseada em permissões
        const docs = loadDocs(isBotOwner, isGroupAdmin)
        
        const userType = isBotOwner ? 'dono do bot' : (isGroupAdmin ? 'admin de grupo' : 'usuário')
        console.log(`📚 [ASK] Carregado ${docs.length} caracteres de documentação (tipo: ${userType})`)
        
        // Debug: mostrar trecho da documentação
        const downloadSection = docs.substring(docs.indexOf('### DOWNLOAD') >= 0 ? docs.indexOf('### DOWNLOAD') : 0, 
                                              docs.indexOf('### DOWNLOAD') >= 0 ? docs.indexOf('### DOWNLOAD') + 500 : 500)
        console.log('📄 [ASK] Trecho da documentação:\n' + downloadSection)
        
        // Criar prompt com contexto
        const prompt = `${docs}

───────────────────────────────────────────

PERGUNTA: ${question}

Ajude o usuário encontrando o comando certo para o que ele precisa.`

        console.log('📤 [ASK] Enviando para Gemini...')
        
        const result = await model.generateContent(prompt)
        const response = result.response
        const text = response.text()
        
        return text.trim()
    } catch (error: any) {
        console.error('Erro ao consultar Gemini:', error)
        
        if (error?.message?.includes('API_KEY')) {
            throw new Error('Erro na API Key do Google AI. Verifique sua configuração.')
        }
        
        throw new Error('Erro ao consultar o assistente. Tente novamente em alguns instantes.')
    }
}

// Limpar cache (útil para testes)
export function clearDocsCache() {
    userDocsCache = null
    groupAdminDocsCache = null
    botOwnerDocsCache = null
}

// Funções antigas mantidas para compatibilidade
export async function questionAI(text: string){
    try {
        //
    } catch(err){
        showConsoleLibraryError(err, 'questionAI')
        throw new Error(botTexts.library_error)
    }
}

export async function imageAI(text: string){
    try {
        //
    } catch(err){
        showConsoleLibraryError(err, 'imageAI')
        throw new Error(botTexts.library_error)
    }
}