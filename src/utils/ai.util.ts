import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { join } from 'path'
import { aiConfig } from '../config/ai.config.js'
import { showConsoleLibraryError } from './general.util.js'
import botTexts from '../helpers/bot.texts.helper.js'

// Cache para os documentos (carregar apenas uma vez)
let userDocsCache: string | null = null
let adminDocsCache: string | null = null

function loadDocs(isAdmin: boolean): string {
    try {
        if (isAdmin && adminDocsCache) return adminDocsCache
        if (!isAdmin && userDocsCache) return userDocsCache
        
        const filename = isAdmin ? 'comandos-admin.txt' : 'comandos-usuario.txt'
        const filePath = join(process.cwd(), 'docs', 'commands', filename)
        
        const content = readFileSync(filePath, 'utf-8')
        
        if (isAdmin) {
            adminDocsCache = content
        } else {
            userDocsCache = content
        }
        
        return content
    } catch (error) {
        throw new Error('Documentação de comandos não encontrada. Execute: bun run scripts/generate-commands-docs.ts')
    }
}

export async function askGemini(question: string, isAdmin: boolean): Promise<string> {
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
        
        // Carregar documentação apropriada
        const docs = loadDocs(isAdmin)
        
        // Criar prompt com contexto
        const prompt = `CONTEXTO - Comandos disponíveis:
${docs}

PERGUNTA DO USUÁRIO: ${question}

Responda de forma concisa e clara sobre o comando solicitado.`
        
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
    adminDocsCache = null
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