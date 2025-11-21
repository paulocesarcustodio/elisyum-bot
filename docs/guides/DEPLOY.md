# 🚀 Guia de Deploy do Elisyum Bot

## 📋 Pré-requisitos no Servidor

### 1. Instalar Bun
```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Instalar FFmpeg (necessário para conversão de áudio/vídeo)
```bash
sudo apt update
sudo apt install -y ffmpeg
```

> ℹ️ O `sharp` é instalado automaticamente pelo Bun como dependência opcional do Baileys. Em distribuições sem binários pré-compilados, instale o toolchain (`sudo apt install -y build-essential python3 make g++`) antes de rodar o `bun install` para permitir a compilação local. Sem o `sharp`, a geração de miniaturas em stickers/imagens falhará.

### 3. Instalar yt-dlp (para downloads do YouTube)
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

## 🔧 Deploy Inicial

### 1. Clonar o repositório
```bash
cd ~
git clone https://github.com/paulocesarcustodio/elisyum-bot.git
cd elisyum-bot
```

### 2. Instalar dependências (incluindo dev)
```bash
bun install
```

### 3. Baixar yt-dlp local (backup)
```bash
bun run scripts/setup/install-ytdlp.js
```

### 4. Compilar o projeto
```bash
bun run build
```
Ou manualmente:
```bash
bun run tsc
bun run copyfiles -u 2 src/media/* dist/media
```

### 5. Iniciar o bot
```bash
bun start
```

> 💡 Prefere automatizar todo o processo? Execute `./scripts/setup/deploy.sh` para validar dependências, baixar o `yt-dlp` local e compilar o projeto em um único comando.

## 🔄 Atualizar Deploy

### Atualização simples (sem mudanças em dependências)
```bash
cd ~/elisyum-bot
git pull origin main
bun run build
bun start
```

### Atualização completa (com novas dependências)
```bash
cd ~/elisyum-bot
git pull origin main
bun install
bun run build
bun start
```

## 🛠️ Comandos Úteis

### Verificar instalação
```bash
bun --version     # Deve ser 1.0+
ffmpeg -version   # Deve existir
yt-dlp --version  # Deve existir
```

### Limpar e rebuildar
```bash
bun run clean
bun run build
```

### Verificar tipos TypeScript
```bash
bun run tsc --noEmit
```

### Ver logs em tempo real
```bash
bun start
# Ou para manter rodando em background:
nohup bun start > bot.log 2>&1 &
```

## 🐛 Solução de Problemas

### Erro: "rimraf: not found" ou "tsc: not found"
**Causa:** Dependências não foram instaladas corretamente

**Solução:**
```bash
bun install  # Reinstala TODAS as dependências
bun run build
```

### Erro: "Cannot find module '/root/elisyum-bot/dist/app.js'"
**Causa:** Projeto não foi compilado

**Solução:**
```bash
bun install    # Garante que tem TypeScript
bun run build  # Compila o projeto
```

### Erro: "ffmpeg exited with code 1"
**Causa:** FFmpeg não instalado

**Solução:**
```bash
sudo apt install -y ffmpeg
```

### Erro: "No image processing library available"
**Causa:** O `sharp` não foi instalado (download falhou ou compilação local não disponível)

**Solução:**
```bash
sudo apt install -y build-essential python3 make g++
bun install
```
Se o ambiente bloquear o download de binários do `sharp`, instale as bibliotecas do sistema para permitir compilação local.

### Erro: "spawn yt-dlp ENOENT"
**Causa:** yt-dlp não instalado ou não encontrado

**Solução:**
```bash
# Instalar globalmente
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# OU usar o local (já está no projeto)
bun run scripts/setup/install-ytdlp.js
```

## 📦 Estrutura após Build

```
elisyum-bot/
├── dist/              # Código compilado (gerado pelo build)
│   ├── app.js        # Ponto de entrada
│   ├── commands/
│   ├── utils/
│   └── media/        # Assets copiados
├── bin/
│   └── yt-dlp        # Binário do yt-dlp local
├── scripts/
│   ├── manual-tests/ # Testes manuais do bot
│   ├── setup/        # Scripts de setup (deploy, yt-dlp)
│   └── tooling/      # Ferramentas auxiliares
├── src/              # Código fonte TypeScript
├── storage/          # Dados do bot (sessão, grupos, etc)
├── node_modules/     # Dependências
└── package.json
```

## 🔐 PM2 (Recomendado para Produção)

### Instalar PM2
```bash
npm install -g pm2
```

### Iniciar com PM2
```bash
cd ~/elisyum-bot
pm2 start bun --name "elisyum-bot" -- start
```

### Gerenciar com PM2
```bash
pm2 status              # Ver status
pm2 logs elisyum-bot    # Ver logs
pm2 restart elisyum-bot # Reiniciar
pm2 stop elisyum-bot    # Parar
pm2 delete elisyum-bot  # Remover
```

### Auto-start no boot
```bash
pm2 startup
pm2 save
```

## 📝 Notas Importantes

1. **Sempre use `bun install` no servidor** para ter as ferramentas de build
2. **Compile antes de iniciar** com `bun run build`
3. **FFmpeg é obrigatório** para comandos de áudio/vídeo
4. **yt-dlp pode ser global ou local** (o bot tenta ambos)
5. **Use PM2 em produção** para restart automático
