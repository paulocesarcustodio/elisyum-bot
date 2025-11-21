#!/bin/bash
# Script de setup/deploy do Elisyum Bot

set -e  # Para na primeira erro

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BIN_DIR="${PROJECT_ROOT}/bin"

cd "${PROJECT_ROOT}"
mkdir -p "${BIN_DIR}"

if [ "${OS}" = "Windows_NT" ]; then
    YTDLP_FILENAME="yt-dlp.exe"
else
    YTDLP_FILENAME="yt-dlp"
fi
LOCAL_YTDLP="${BIN_DIR}/${YTDLP_FILENAME}"

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
        echo -e "${RED}✗${NC} Node.js v20+ é obrigatório (versão detectada: $NODE_VERSION)"
        echo "Atualize o Node.js antes de continuar."
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Node.js não instalado!"
    echo "Execute: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

# Verificar Bun
echo "📦 Verificando Bun..."
if command_exists bun; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓${NC} Bun instalado: v$BUN_VERSION"
else
    echo -e "${YELLOW}⚠${NC}  Bun não instalado. Instalando..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    echo -e "${GREEN}✓${NC} Bun instalado!"
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
if [ -f "${LOCAL_YTDLP}" ]; then
    if [ "${OS}" != "Windows_NT" ] && [ ! -x "${LOCAL_YTDLP}" ]; then
        echo "🔧 Corrigindo permissões do yt-dlp local..."
        chmod +x "${LOCAL_YTDLP}"
    fi

    if "${LOCAL_YTDLP}" --version >/dev/null 2>&1; then
        YTDLP_LOCAL_VERSION=$("${LOCAL_YTDLP}" --version)
        echo -e "${GREEN}✓${NC} yt-dlp local encontrado: $YTDLP_LOCAL_VERSION"
        YTDLP_INSTALLED=true
    else
        echo -e "${YELLOW}⚠${NC}  yt-dlp local inválido. Reinstalando..."
        curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_FILENAME}" -o "${LOCAL_YTDLP}"
        if [ "${OS}" != "Windows_NT" ]; then
            chmod +x "${LOCAL_YTDLP}"
        fi
        YTDLP_LOCAL_VERSION=$("${LOCAL_YTDLP}" --version)
        echo -e "${GREEN}✓${NC} yt-dlp local reinstalado: $YTDLP_LOCAL_VERSION"
        YTDLP_INSTALLED=true
    fi
else
    echo "📥 Baixando yt-dlp local..."
    curl -L "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_FILENAME}" -o "${LOCAL_YTDLP}"
    if [ "${OS}" != "Windows_NT" ]; then
        chmod +x "${LOCAL_YTDLP}"
    fi
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
bun install

echo ""
echo "🏗️  Compilando projeto..."
bun run build

echo ""
echo -e "${GREEN}✅ Setup completo!${NC}"
echo ""
echo "Para iniciar o bot:"
echo "  bun start"
echo ""
echo "Para usar PM2 (recomendado para produção):"
echo "  npm install -g pm2"
echo "  pm2 start bun --name elisyum-bot -- start"
echo "  pm2 save"
echo ""
