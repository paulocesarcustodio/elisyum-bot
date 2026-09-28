import crypto from 'crypto'
import { askCacheDb } from '../database/db.js'
import { REMOVED_COMMAND_NAMES } from '../commands/removed.commands.js'

/**
 * Normaliza pergunta para aumentar hit rate do cache
 * - Remove pontuação
 * - Converte para lowercase
 * - Remove espaços extras
 * - Remove acentos
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s]/g, ' ') // Remove pontuação
    .replace(/\s+/g, ' ') // Remove espaços duplicados
    .trim()
}

/**
 * Invalida respostas de catálogos antigos quando comandos são removidos.
 */
export function generateQuestionHash(question: string): string {
  const normalized = normalizeQuestion(question)
  return crypto
    .createHash('sha256')
    .update(REMOVED_COMMAND_NAMES.join(','))
    .update('\0')
    .update(normalized)
    .digest('hex')
}

/**
 * Determina tipo de usuário para cache
 */
export function getUserType(isBotOwner: boolean, isGroupAdmin: boolean): string {
  if (isBotOwner) return 'owner'
  if (isGroupAdmin) return 'admin'
  return 'user'
}

/**
 * Busca resposta no cache com consultas paralelas para variações
 */
export async function getCachedAnswer(
  question: string, 
  isBotOwner: boolean, 
  isGroupAdmin: boolean
): Promise<string | null> {
  const userType = getUserType(isBotOwner, isGroupAdmin)
  const questionHash = generateQuestionHash(question)
  
  // Consulta principal
  const mainQuery = askCacheDb.get(questionHash, userType)
  
  // Consultas paralelas para variações (caso a pergunta tenha pequenas diferenças)
  const variations = [
    question + '?',
    question.replace('?', ''),
    'como ' + question,
    question.replace('como ', '')
  ]
  
  const variationQueries = variations
    .filter(v => v !== question) // Remove duplicatas
    .map(v => {
      const hash = generateQuestionHash(v)
      return askCacheDb.get(hash, userType)
    })
  
  // Executa todas as queries em paralelo
  const results = await Promise.all([mainQuery, ...variationQueries])
  
  // Retorna primeiro resultado encontrado
  const cached = results.find(r => r !== undefined)
  
  if (cached) {
    console.log(`[ASK-CACHE] ✅ Cache HIT! Pergunta: "${question.substring(0, 50)}..." (${cached.hit_count}x usada)`)
    return cached.answer
  }
  
  console.log(`[ASK-CACHE] ❌ Cache MISS: "${question.substring(0, 50)}..."`)
  return null
}

/**
 * Salva resposta no cache
 */
export async function setCachedAnswer(
  question: string, 
  answer: string, 
  isBotOwner: boolean, 
  isGroupAdmin: boolean
): Promise<void> {
  const userType = getUserType(isBotOwner, isGroupAdmin)
  const questionHash = generateQuestionHash(question)
  
  ;(await askCacheDb.set(questionHash, question, answer, userType))
  console.log(`[ASK-CACHE] 💾 Salvou resposta: "${question.substring(0, 50)}..." (${userType})`)
}

/**
 * Executa manutenção do cache (limpeza + limite)
 */
export async function performCacheMaintenance(): Promise<void> {
  console.log('[ASK-CACHE] 🔧 Iniciando manutenção do cache...')
  
  const oldEntriesRemoved = (await askCacheDb.cleanOld())
  const limitEntriesRemoved = (await askCacheDb.enforceLimit(500))
  
  const stats = (await askCacheDb.stats())
  console.log(`[ASK-CACHE] ✅ Manutenção concluída:`)
  console.log(`  - Entradas antigas removidas: ${oldEntriesRemoved}`)
  console.log(`  - Entradas por limite removidas: ${limitEntriesRemoved}`)
  console.log(`  - Total de entradas no cache: ${stats.total}`)
}
