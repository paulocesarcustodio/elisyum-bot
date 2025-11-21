#!/bin/bash

# Script auxiliar para iniciar o bot
# Garante que o Bun está no PATH

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Adicionar Bun ao PATH se existir
if [ -d "$HOME/.bun" ]; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Verificar se Bun existe
if ! command -v bun >/dev/null 2>&1; then
    echo -e "${RED}✗ Bun não encontrado!${NC}"
    echo ""
    echo -e "${YELLOW}Execute um dos comandos:${NC}"
    echo ""
    echo "1. Recarregar o shell:"
    echo -e "   ${BLUE}source ~/.bashrc${NC}"
    echo ""
    echo "2. Ou adicionar ao PATH desta sessão:"
    echo -e "   ${BLUE}export BUN_INSTALL=\"\$HOME/.bun\"${NC}"
    echo -e "   ${BLUE}export PATH=\"\$BUN_INSTALL/bin:\$PATH\"${NC}"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Bun encontrado!${NC}"
echo -e "${BLUE}Iniciando bot...${NC}"
echo ""

# Iniciar o bot
bun start
