import { WASocket } from '@whiskeysockets/baileys'
import { GroupController } from '../controllers/group.controller.js'
import { getCurrentBotVersion } from '../utils/general.util.js'
import fs from 'fs'
import path from 'path'

interface VersionInfo {
    lastNotifiedVersion: string
}

const VERSION_FILE = path.join(process.cwd(), 'storage', 'last-version.json')

/**
 * Lê a última versão que teve patch notes enviadas
 */
function getLastNotifiedVersion(): string | null {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const data = fs.readFileSync(VERSION_FILE, 'utf8')
            const versionInfo: VersionInfo = JSON.parse(data)
            return versionInfo.lastNotifiedVersion
        }
    } catch (err) {
        console.error('[PatchNotes] Erro ao ler última versão:', err)
    }
    return null
}

/**
 * Salva a versão atual como última notificada
 */
function saveLastNotifiedVersion(version: string): void {
    try {
        const versionInfo: VersionInfo = { lastNotifiedVersion: version }
        fs.writeFileSync(VERSION_FILE, JSON.stringify(versionInfo, null, 2), 'utf8')
        console.log(`[PatchNotes] Versão ${version} salva como última notificada`)
    } catch (err) {
        console.error('[PatchNotes] Erro ao salvar versão:', err)
    }
}

/**
 * Extrai as patch notes da versão atual do CHANGELOG.md
 */
function getCurrentPatchNotes(currentVersion: string): string | null {
    try {
        const changelogPath = path.join(process.cwd(), 'docs', 'releases', 'CHANGELOG.md')
        
        if (!fs.existsSync(changelogPath)) {
            console.error('[PatchNotes] CHANGELOG.md não encontrado')
            return null
        }

        const changelog = fs.readFileSync(changelogPath, 'utf8')
        
        // Procura pela seção da versão atual (aceita versão com ou sem data/texto adicional)
        const versionRegex = new RegExp(`## ${currentVersion.replace(/\./g, '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|$)`, 'm')
        const match = changelog.match(versionRegex)
        
        if (match && match[1]) {
            return match[1].trim()
        }
        
        console.log(`[PatchNotes] Patch notes para versão ${currentVersion} não encontradas no CHANGELOG`)
        return null
    } catch (err) {
        console.error('[PatchNotes] Erro ao ler CHANGELOG:', err)
        return null
    }
}

/**
 * Formata as patch notes para WhatsApp
 */
function formatPatchNotes(version: string, notes: string): string {
    return `🤖 *ELISYUM BOT - Atualização v${version}*\n\n${notes}\n\n_Mensagem automática de atualização_`
}

/**
 * Verifica se há uma nova versão e envia patch notes para todos os grupos
 */
export async function checkAndNotifyPatchNotes(client: WASocket): Promise<void> {
    try {
        const currentVersion = getCurrentBotVersion()
        
        if (!currentVersion) {
            console.error('[PatchNotes] Versão do bot não encontrada')
            return
        }

        const lastNotifiedVersion = getLastNotifiedVersion()

        // Se já notificamos essa versão, não faz nada
        if (lastNotifiedVersion === currentVersion) {
            console.log(`[PatchNotes] Versão ${currentVersion} já foi notificada anteriormente`)
            return
        }

        console.log(`[PatchNotes] Nova versão detectada: ${currentVersion} (última: ${lastNotifiedVersion || 'nenhuma'})`)

        // Busca as patch notes da versão atual
        const patchNotes = getCurrentPatchNotes(currentVersion)
        
        if (!patchNotes) {
            console.log('[PatchNotes] Nenhuma patch note encontrada para esta versão')
            // Salva a versão mesmo sem patch notes para não verificar novamente
            saveLastNotifiedVersion(currentVersion)
            return
        }

        // Formata a mensagem
        const message = formatPatchNotes(currentVersion, patchNotes)

        // Busca todos os grupos
        const groupController = new GroupController()
        const allGroups = await groupController.getAllGroups()

        if (!allGroups || allGroups.length === 0) {
            console.log('[PatchNotes] Nenhum grupo encontrado')
            saveLastNotifiedVersion(currentVersion)
            return
        }

        console.log(`[PatchNotes] Enviando patch notes para ${allGroups.length} grupos...`)

        let successCount = 0
        let errorCount = 0

        // Envia e fixa a mensagem em cada grupo
        for (const group of allGroups) {
            try {
                console.log(`[PatchNotes] Tentando enviar para: ${group.name} (${group.id})`)
                
                // Envia a mensagem
                const sentMessage = await client.sendMessage(group.id, { 
                    text: message 
                })

                console.log(`[PatchNotes] Mensagem enviada. Key:`, sentMessage?.key)

                if (sentMessage && sentMessage.key && sentMessage.key.id) {
                    // Aguarda 500ms antes de fixar (para garantir que a mensagem foi recebida)
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    console.log(`[PatchNotes] Tentando fixar mensagem...`)
                    
                    // Fixa a mensagem no grupo por 24 horas (pin type 1)
                    const pinResult = await client.sendMessage(group.id, {
                        pin: sentMessage.key,
                        type: 1, // 1 = pin, 0 = unpin
                        time: 86400 // 24 horas em segundos
                    })

                    console.log(`[PatchNotes] Resultado do pin:`, pinResult)
                    console.log(`[PatchNotes] ✅ Enviado e fixado em: ${group.name}`)
                    successCount++
                } else {
                    console.log(`[PatchNotes] ⚠️ Mensagem enviada mas key inválida em: ${group.name}`)
                    successCount++
                }

                // Aguarda 2 segundos entre cada grupo para evitar spam
                await new Promise(resolve => setTimeout(resolve, 2000))

            } catch (err) {
                console.error(`[PatchNotes] ❌ Erro ao enviar para ${group.name}:`, err)
                errorCount++
            }
        }

        console.log(`[PatchNotes] Conclusão: ${successCount} sucessos, ${errorCount} erros`)

        // Salva a versão como notificada
        saveLastNotifiedVersion(currentVersion)

    } catch (err) {
        console.error('[PatchNotes] Erro geral:', err)
    }
}
