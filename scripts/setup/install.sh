#!/bin/bash

# Script de instalação do Elisyum Bot
# Autor: Paulo Cesar Custodio
# Data: 21/11/2025

set -e  # Para em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para imprimir sucesso
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Função para imprimir erro
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Função para imprimir aviso
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Função para imprimir informação
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Instalação do Elisyum Bot${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Verificar se já está dentro do repositório
if [ ! -f "package.json" ] || ! grep -q "elisyum-bot\|lbot-whatsapp" package.json 2>/dev/null; then
    print_info "Não está dentro do repositório. Clonando..."
    
    if command_exists git; then
        git clone https://github.com/paulocesarcustodio/elisyum-bot.git
        cd elisyum-bot || exit 1
        print_success "Repositório clonado com sucesso!"
    else
        print_error "Git não está instalado. Instale com: sudo apt-get install git"
        exit 1
    fi
fi

# 1. Verificar se Bun está instalado
echo -e "\n${BLUE}[1/6]${NC} Verificando Bun..."

# Adicionar Bun ao PATH se existir mas não estiver no PATH
if [ -d "$HOME/.bun" ] && [ ! -x "$(command -v bun 2>/dev/null)" ]; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

if command_exists bun; then
    BUN_VERSION=$(bun --version)
    print_success "Bun já está instalado (v$BUN_VERSION)"
else
    print_warning "Bun não encontrado. Instalando..."
    curl -fsSL https://bun.sh/install | bash
    
    # Adicionar Bun ao PATH da sessão atual
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    if command_exists bun; then
        print_success "Bun instalado com sucesso!"
    else
        print_error "Falha ao instalar Bun. Por favor, instale manualmente: https://bun.sh"
        exit 1
    fi
fi

# 2. Verificar dependências do sistema
echo -e "\n${BLUE}[2/6]${NC} Verificando dependências do sistema..."

# SQLite3 (não é necessário instalar separadamente, Bun já vem com bun:sqlite)
print_info "SQLite: Bun usa bun:sqlite (built-in)"

# FFmpeg para conversão de áudio/vídeo
if command_exists ffmpeg; then
    print_success "FFmpeg já está instalado"
else
    print_warning "FFmpeg não encontrado"
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        print_info "Instalando FFmpeg no Linux..."
        if command_exists apt-get; then
            sudo apt-get update && sudo apt-get install -y ffmpeg
        elif command_exists yum; then
            sudo yum install -y ffmpeg
        elif command_exists dnf; then
            sudo dnf install -y ffmpeg
        else
            print_error "Gerenciador de pacotes não suportado. Instale FFmpeg manualmente."
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        print_info "Instalando FFmpeg no macOS..."
        if command_exists brew; then
            brew install ffmpeg
        else
            print_error "Homebrew não encontrado. Instale FFmpeg manualmente."
        fi
    fi
    
    if command_exists ffmpeg; then
        print_success "FFmpeg instalado com sucesso!"
    else
        print_warning "FFmpeg não foi instalado. Alguns comandos podem não funcionar."
    fi
fi

# Canvas dependencies para Linux
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_info "Verificando dependências do Canvas..."
    
    CANVAS_DEPS="libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev"
    MISSING_DEPS=""
    
    for dep in $CANVAS_DEPS; do
        if ! dpkg -l | grep -q "^ii  $dep"; then
            MISSING_DEPS="$MISSING_DEPS $dep"
        fi
    done
    
    if [ -n "$MISSING_DEPS" ]; then
        print_warning "Instalando dependências do Canvas..."
        if command_exists apt-get; then
            sudo apt-get update && sudo apt-get install -y $MISSING_DEPS
            print_success "Dependências do Canvas instaladas!"
        else
            print_warning "Instale manualmente: $MISSING_DEPS"
        fi
    else
        print_success "Dependências do Canvas já estão instaladas"
    fi
fi

# 3. Instalar dependências do projeto
echo -e "\n${BLUE}[3/6]${NC} Instalando dependências do Node.js..."
if [ -f "package.json" ]; then
    bun install
    print_success "Dependências instaladas com sucesso!"
else
    print_error "package.json não encontrado!"
    exit 1
fi

# 4. Criar estrutura de diretórios
echo -e "\n${BLUE}[4/6]${NC} Criando estrutura de diretórios..."

DIRS=(
    "storage"
    "storage/audios"
    "session"
    "temp"
    "logs/session"
)

for dir in "${DIRS[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_success "Diretório criado: $dir"
    else
        print_info "Diretório já existe: $dir"
    fi
done

# 5. Verificar/criar arquivo .env
echo -e "\n${BLUE}[5/6]${NC} Configurando ambiente..."

if [ ! -f ".env" ]; then
    print_warning ".env não encontrado. Criando template..."
    cat > .env << 'EOF'
# Configurações do Bot
BOT_NAME="Elisyum Bot"
BOT_PREFIX="!"

# Administradores (separados por vírgula)
ADMIN_NUMBERS="5519XXXXXXXXX"

# Deepgram API (para transcrição de áudio)
# Obtenha sua chave em: https://deepgram.com
DEEPGRAM_API_KEY=""

# Configurações opcionais
DEBUG=false
EOF
    print_success ".env criado! Configure suas variáveis de ambiente."
    print_warning "IMPORTANTE: Edite o arquivo .env antes de iniciar o bot!"
else
    print_success ".env já existe"
fi

# 6. Build do projeto
echo -e "\n${BLUE}[6/6]${NC} Compilando TypeScript..."
bun run build

if [ -d "dist" ]; then
    print_success "Build concluído com sucesso!"
else
    print_error "Falha no build do projeto"
    exit 1
fi

# Resumo final
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✓ Instalação concluída!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}📁 Diretório do bot:${NC} $(pwd)"
echo ""

# Verificar se Bun está no PATH permanentemente
if ! grep -q "BUN_INSTALL" "$HOME/.bashrc" 2>/dev/null; then
    print_warning "Adicionando Bun ao ~/.bashrc para persistir entre sessões..."
    echo '' >> "$HOME/.bashrc"
    echo '# Bun runtime' >> "$HOME/.bashrc"
    echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
    print_success "Bun adicionado ao ~/.bashrc"
fi

echo ""
echo -e "${YELLOW}⚠ IMPORTANTE:${NC} Bun foi instalado! Execute um dos comandos abaixo:"
echo ""
echo -e "${BLUE}Opção 1 (recarregar shell atual):${NC}"
echo -e "  ${YELLOW}source ~/.bashrc${NC}"
echo ""
echo -e "${BLUE}Opção 2 (nova sessão):${NC}"
echo -e "  ${YELLOW}exit${NC} e faça login novamente"
echo ""
echo -e "${BLUE}Depois, continue:${NC}"
echo ""
echo "1. Entre no diretório: ${YELLOW}cd elisyum-bot${NC} (se não estiver nele)"
echo "2. Configure o arquivo .env: ${YELLOW}nano .env${NC}"
echo "3. Execute: ${YELLOW}bun start${NC}"
echo "4. Escaneie o QR Code com seu WhatsApp"
echo ""
echo -e "${BLUE}Comandos úteis:${NC}"
echo ""
echo "  ${YELLOW}bun start${NC}        - Iniciar o bot"
echo "  ${YELLOW}bun run dev${NC}      - Modo desenvolvimento (recompila)"
echo "  ${YELLOW}bun run build${NC}    - Recompilar TypeScript"
echo "  ${YELLOW}bun run migrate${NC}  - Executar migrações do banco"
echo ""
echo -e "${BLUE}Documentação:${NC}"
echo ""
echo "  Comandos: docs/reference/COMANDOS.md"
echo "  Deploy: docs/guides/DEPLOY.md"
echo ""
print_success "Tudo pronto! 🚀"
echo ""
