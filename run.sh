#!/bin/bash
# Wrapper que adiciona Bun ao PATH e executa o bot
# Útil quando você não quer recarregar o shell

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Adicionar Bun ao PATH
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Verificar se Bun existe
if ! command -v bun >/dev/null 2>&1; then
    echo -e "${RED}❌ Erro: Bun não encontrado em $BUN_INSTALL/bin${NC}"
    echo ""
    echo -e "${BLUE}Soluções:${NC}"
    echo ""
    echo "1. Recarregue o shell:"
    echo -e "   ${GREEN}source ~/.bashrc${NC}"
    echo ""
    echo "2. Ou instale o Bun:"
    echo -e "   ${GREEN}curl -fsSL https://bun.sh/install | bash${NC}"
    echo ""
    exit 1
fi

# Mudar para o diretório do script
cd "$(dirname "$0")"

# Verificar se .env existe
if [ ! -f ".env" ]; then
    echo -e "${RED}⚠️  Atenção: Arquivo .env não encontrado!${NC}"
    echo ""
    echo "Configure suas variáveis de ambiente primeiro:"
    echo -e "${GREEN}nano .env${NC}"
    echo ""
    read -p "Deseja continuar mesmo assim? (s/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 1
    fi
fi

# Iniciar o bot
echo -e "${BLUE}🚀 Iniciando Elisyum Bot...${NC}"
echo ""
exec bun start
