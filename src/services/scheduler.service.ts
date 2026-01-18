import { WASocket } from "@whiskeysockets/baileys"
import cron from 'node-cron'
import * as downloadUtil from '../utils/download.util.js'
import * as convertUtil from '../utils/convert.util.js'
import { GroupController } from "../controllers/group.controller.js"
import { performCacheMaintenance } from '../helpers/ask.cache.helper.js'

export class SchedulerService {
    private client: WASocket
    private groupController: GroupController

    constructor(client: WASocket) {
        this.client = client
        this.groupController = new GroupController()
    }

    /**
     * Inicializa os agendamentos
     */
    public init() {
        console.log('[Scheduler] 📅 Inicializando agendamentos do bot...')
        
        // Todo sábado às 12:00 (horário de Brasília)
        cron.schedule('0 12 * * 6', async () => {
            await this.sendKasinoVideo()
        }, {
            timezone: 'America/Sao_Paulo'
        })

        // Limpeza diária do cache de perguntas às 3:00 da manhã
        cron.schedule('0 3 * * *', async () => {
            performCacheMaintenance()
        }, {
            timezone: 'America/Sao_Paulo'
        })

        console.log('[Scheduler] ✅ Agendamento do vídeo Kasino configurado para sábados às 12:00')
        console.log('[Scheduler] ✅ Agendamento de limpeza do cache ASK configurado para diariamente às 03:00')
    }

    /**
     * Busca o vídeo "Kasino no Sabadaço" e envia para todos os grupos
     */
    private async sendKasinoVideo() {
        try {
            console.log('[Scheduler] 🎥 Iniciando busca do vídeo Kasino no Sabadaço...')
            
            // Busca o vídeo
            const videoInfo = await downloadUtil.youtubeMedia('Kasino no Sabadaço')
            
            if (!videoInfo) {
                console.error('[Scheduler] ❌ Vídeo não encontrado')
                return
            }

            if (videoInfo.is_live) {
                console.error('[Scheduler] ❌ O vídeo é uma live, não será enviado')
                return
            }

            console.log('[Scheduler] ✅ Vídeo encontrado:', videoInfo.title)
            console.log('[Scheduler] 📺 URL:', `https://www.youtube.com/watch?v=${videoInfo.id_video}`)
            console.log('[Scheduler] ⏱️ Duração:', videoInfo.duration_formatted)

            // Baixa o vídeo
            const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.id_video}`
            console.log('[Scheduler] 📥 Baixando vídeo...')
            
            const videoBuffer = await downloadUtil.downloadYouTubeVideo(youtubeUrl)
            const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2)
            
            console.log('[Scheduler] ✅ Vídeo baixado com sucesso! Tamanho:', videoSizeMB, 'MB')

            // Obtém todos os grupos
            const groups = await this.groupController.getAllGroups()
            console.log('[Scheduler] 📤 Enviando vídeo para', groups.length, 'grupos...')

            // Envia para cada grupo
            let successCount = 0
            let errorCount = 0

            for (const group of groups) {
                try {
                    // Gera thumbnail do vídeo
                    const base64Thumb = await convertUtil.convertVideoToThumbnail('buffer', videoBuffer)
                    
                    await this.client.sendMessage(
                        group.id,
                        {
                            video: videoBuffer,
                            caption: '',
                            mimetype: 'video/mp4',
                            jpegThumbnail: base64Thumb
                        },
                        {
                            ephemeralExpiration: group.expiration
                        }
                    )
                    successCount++
                    console.log(`[Scheduler] ✅ Enviado para: ${group.name}`)
                    
                    // Delay entre envios para evitar bloqueio
                    await new Promise(resolve => setTimeout(resolve, 2000))
                } catch (error) {
                    errorCount++
                    console.error(`[Scheduler] ❌ Erro ao enviar para ${group.name}:`, error)
                }
            }

            console.log('[Scheduler] 🎉 Processo concluído!')
            console.log(`[Scheduler] 📊 Enviado com sucesso: ${successCount}`)
            console.log(`[Scheduler] ⚠️ Erros: ${errorCount}`)

        } catch (error) {
            console.error('[Scheduler] ❌ Erro ao buscar/enviar vídeo Kasino:', error)
        }
    }

    /**
     * Método público para testar o envio manualmente
     */
    public async testKasinoVideo() {
        console.log('[Scheduler] 🧪 Executando teste manual...')
        await this.sendKasinoVideo()
    }
}
