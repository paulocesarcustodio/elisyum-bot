# 📹 Configuração de Qualidade de Download do YouTube

## 🎯 Qualidade Atual: **480p**

O bot está configurado para baixar vídeos do YouTube em **480p (SD)** para otimizar velocidade e tamanho dos arquivos.

## ⚙️ Como Alterar a Qualidade

Edite o arquivo `src/config/youtube.config.ts`:

```typescript
export const YOUTUBE_QUALITY_LIMIT = 480  // Mude este valor
```

## 📊 Comparativo de Qualidades

| Qualidade | Tamanho (por minuto) | Velocidade | Uso Recomendado |
|-----------|---------------------|------------|-----------------|
| **360p**  | ~3-5 MB             | ⚡⚡⚡ Rápido | Conexão lenta, dados móveis limitados |
| **480p** ✅ | ~8-15 MB          | ⚡⚡ Médio   | **RECOMENDADO** - Equilíbrio ideal |
| **720p**  | ~20-30 MB           | ⚡ Lento     | Wi-Fi rápido, qualidade prioritária |
| **1080p** | ~40-60 MB           | 🐌 Muito lento | Não recomendado para WhatsApp |

## 💡 Por que 480p?

### ✅ Vantagens:
- **Download 2-3x mais rápido** que 720p
- **Arquivos menores** = menos dados consumidos
- **Qualidade suficiente** para visualização em celulares
- **Menor chance de exceder limite do WhatsApp** (16 MB para vídeos)
- **Melhor experiência do usuário** (resposta mais rápida)

### 📱 Limite do WhatsApp:
- Vídeos: máximo 16 MB
- Áudios: sem limite prático
- Com 480p, vídeos de até 2 minutos geralmente ficam abaixo de 16 MB

## 🔧 Exemplos de Configuração

### Para conexões lentas (360p):
```typescript
export const YOUTUBE_QUALITY_LIMIT = 360
```

### Para melhor qualidade (720p):
```typescript
export const YOUTUBE_QUALITY_LIMIT = 720
```

### Para a menor qualidade disponível:
```typescript
export const YOUTUBE_QUALITY_LIMIT = 240
```

## 🎬 Após Alterar

1. Salve o arquivo `src/config/youtube.config.ts`
2. Recompile: `bun run build` ou `bun run tsc`
3. Reinicie o bot: `bun start`

## 📝 Nota

O bot sempre tentará baixar a **melhor qualidade disponível** dentro do limite configurado. Se o vídeo não tiver a resolução solicitada, será baixada a mais próxima disponível.
