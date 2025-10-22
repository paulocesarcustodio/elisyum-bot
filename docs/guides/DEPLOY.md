# 🚀 Guia de Deploy do Elisyum Bot

## 📋 Pré-requisitos no Servidor

### 1. Instalar Node.js (v20+)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Instalar Yarn
```bash
npm install -g yarn
```

### 3. Instalar FFmpeg (necessário para conversão de áudio/vídeo)
```bash
sudo apt update
sudo apt install -y ffmpeg
```

> ℹ️ O `sharp` é instalado automaticamente pelo Yarn como dependência opcional do Baileys. Em distribuições sem binários pré-compilados, instale o toolchain (`sudo apt install -y build-essential python3 make g++`) antes de rodar o `yarn install` para permitir a compilação local. Sem o `sharp`, a geração de miniaturas em stickers/imagens falhará.

### 4. Instalar yt-dlp (para downloads do YouTube)
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
yarn install
```

### 3. Baixar yt-dlp local (backup)
```bash
node scripts/setup/install-ytdlp.js
```

### 4. Compilar o projeto
```bash
yarn build
```
Ou manualmente:
```bash
./node_modules/.bin/tsc
./node_modules/.bin/copyfiles -u 2 src/media/* dist/media
```

### 5. Iniciar o bot
```bash
yarn start
```

> 💡 Prefere automatizar todo o processo? Execute `./scripts/setup/deploy.sh` para validar dependências, baixar o `yt-dlp` local e compilar o projeto em um único comando.

## 🔄 Atualizar Deploy

### Atualização simples (sem mudanças em dependências)
```bash
cd ~/elisyum-bot
git pull origin main
yarn build
yarn start
```

### Atualização completa (com novas dependências)
```bash
cd ~/elisyum-bot
git pull origin main
yarn install
yarn build
yarn start
```

## 🛠️ Comandos Úteis

### Verificar instalação
```bash
node --version    # Deve ser v20+
yarn --version    # Deve ser 1.22+
ffmpeg -version   # Deve existir
yt-dlp --version  # Deve existir
```

### Limpar e rebuildar
```bash
yarn clean
yarn build
```

### Verificar tipos TypeScript
```bash
yarn tsc --noEmit
```

### Ver logs em tempo real
```bash
yarn start
# Ou para manter rodando em background:
nohup yarn start > bot.log 2>&1 &
```

## 🐛 Solução de Problemas

### Erro: "rimraf: not found" ou "tsc: not found"
**Causa:** `yarn install --prod` remove dependências de desenvolvimento

**Solução:**
```bash
yarn install  # Reinstala TODAS as dependências
yarn build
```

### Erro: "Cannot find module '/root/elisyum-bot/dist/app.js'"
**Causa:** Projeto não foi compilado

**Solução:**
```bash
yarn install  # Garante que tem TypeScript
yarn build    # Compila o projeto
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
yarn install --check-cache
```
Se o ambiente bloquear o download de binários do `sharp`, execute `npm_config_sharp_ignore_global_libvips=1 yarn install` para forçar a recompilação usando as bibliotecas do sistema.

### Erro: "spawn yt-dlp ENOENT"
**Causa:** yt-dlp não instalado ou não encontrado

**Solução:**
```bash
# Instalar globalmente
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# OU usar o local (já está no projeto)
node scripts/setup/install-ytdlp.js
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
pm2 start yarn --name "elisyum-bot" -- start
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

1. **Sempre use `yarn install` (sem --prod) no servidor** para ter as ferramentas de build
2. **Compile antes de iniciar** com `yarn build`
3. **FFmpeg é obrigatório** para comandos de áudio/vídeo
4. **yt-dlp pode ser global ou local** (o bot tenta ambos)
5. **Use PM2 em produção** para restart automático
