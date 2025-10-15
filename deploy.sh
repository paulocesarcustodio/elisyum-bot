#!/bin/bash
# Script de setup/deploy do Elisyum Bot

set -e  # Para na primeira erro

echo "🚀 Elisyum Bot - Setup/Deploy Script"
echo "======================================"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar Node.js
echo "📦 Verificando Node.js..."
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js instalado: $NODE_VERSION"
    
    # Verificar se é v20+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -lt 20 ]; then
        echo -e "${YELLOW}⚠${NC}  Aviso: Node.js v20+ recomendado (você tem v$MAJOR_VERSION)"
    fi
else
    echo -e "${RED}✗${NC} Node.js não instalado!"
    echo "Execute: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

# Verificar Yarn
echo "📦 Verificando Yarn..."
if command_exists yarn; then
    YARN_VERSION=$(yarn --version)
    echo -e "${GREEN}✓${NC} Yarn instalado: v$YARN_VERSION"
else
    echo -e "${YELLOW}⚠${NC}  Yarn não instalado. Instalando..."
    npm install -g yarn
    echo -e "${GREEN}✓${NC} Yarn instalado!"
fi

# Verificar FFmpeg
echo "🎬 Verificando FFmpeg..."
if command_exists ffmpeg; then
    FFMPEG_VERSION=$(ffmpeg -version | head -n1)
    echo -e "${GREEN}✓${NC} FFmpeg instalado: $FFMPEG_VERSION"
else
    echo -e "${RED}✗${NC} FFmpeg não instalado!"
    echo "Execute: sudo apt install -y ffmpeg"
    exit 1
fi

# Verificar/Instalar yt-dlp
echo "📹 Verificando yt-dlp..."
YTDLP_INSTALLED=false

if command_exists yt-dlp; then
    YTDLP_VERSION=$(yt-dlp --version)
    echo -e "${GREEN}✓${NC} yt-dlp instalado globalmente: $YTDLP_VERSION"
    YTDLP_INSTALLED=true
fi

# Sempre garantir que existe o binário local também
if [ -f "./yt-dlp" ]; then
    YTDLP_LOCAL_VERSION=$(./yt-dlp --version 2>/dev/null || echo "desconhecido")
    echo -e "${GREEN}✓${NC} yt-dlp local encontrado: $YTDLP_LOCAL_VERSION"
    YTDLP_INSTALLED=true
else
    echo "📥 Baixando yt-dlp local..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
    chmod +x yt-dlp
    echo -e "${GREEN}✓${NC} yt-dlp local instalado!"
    YTDLP_INSTALLED=true
fi

if [ "$YTDLP_INSTALLED" = false ]; then
    echo -e "${RED}✗${NC} Falha ao instalar yt-dlp!"
    exit 1
fi

echo ""
echo "🔧 Instalando dependências..."
rm -rf node_modules
yarn install --force

echo ""
echo "🏗️  Compilando projeto..."
yarn build

echo ""
echo -e "${GREEN}✅ Setup completo!${NC}"
echo ""
echo "Para iniciar o bot:"
echo "  yarn start"
echo ""
echo "Para usar PM2 (recomendado para produção):"
echo "  npm install -g pm2"
echo "  pm2 start yarn --name elisyum-bot -- start"
echo "  pm2 save"
echo ""
