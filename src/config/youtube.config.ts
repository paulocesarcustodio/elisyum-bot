/**
 * Configurações de download do YouTube
 * 
 * YOUTUBE_QUALITY_LIMIT: Define a resolução máxima para downloads
 * - 360: Baixa qualidade, download rápido (~3-5 MB por minuto)
 * - 480: Boa qualidade, velocidade média (~8-15 MB por minuto) [RECOMENDADO]
 * - 720: Alta qualidade, download lento (~20-30 MB por minuto)
 * 
 * Recomendações:
 * - 480p é ideal para WhatsApp (equilíbrio entre qualidade e tamanho)
 * - Arquivos menores = downloads mais rápidos = melhor experiência
 * - WhatsApp tem limite de 16MB para vídeos, 480p geralmente fica abaixo disso
 * 
 * Otimizações de Performance:
 * - Download paralelo de fragmentos (--concurrent-fragments)
 * - Buffer aumentado (--buffer-size)
 * - Chunks maiores para reduzir overhead (--http-chunk-size)
 * - Prioriza formatos pré-mesclados para evitar merge de vídeo+áudio
 */

export const YOUTUBE_QUALITY_LIMIT = 480

/**
 * Limite de duração em segundos (padrão: 360s = 6 minutos)
 * Definido nos comandos play e yt
 */
export const YOUTUBE_DURATION_LIMIT = 360
