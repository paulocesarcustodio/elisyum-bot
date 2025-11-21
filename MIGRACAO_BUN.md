# Migração para Bun

Este projeto foi configurado para usar o Bun como runtime e gerenciador de pacotes.

## Instalação do Bun

### Linux/macOS/WSL
```bash
curl -fsSL https://bun.sh/install | bash
```

### Alternativa com npm
```bash
npm install -g bun
```

### Verificar instalação
```bash
bun --version
```

## Instalar Dependências

Após instalar o Bun, execute:

```bash
bun install
```

Isso irá:
- Instalar todas as dependências do projeto
- Criar o arquivo `bun.lockb`
- Configurar o projeto para uso com Bun

## Scripts Disponíveis

```bash
# Desenvolvimento
bun run dev              # Build e executa o bot

# Produção
bun run build           # Compila o TypeScript
bun start               # Executa o bot compilado

# Outros
bun run migrate         # Executa com migração de dados
bun run clean           # Limpa a pasta dist
bun run zip             # Cria um arquivo zip da build
```

## Vantagens do Bun

- ⚡ **Mais rápido**: Instalação e execução significativamente mais rápidas
- 🔋 **All-in-one**: Runtime, bundler, test runner e package manager
- 📦 **Compatível**: Funciona com pacotes npm
- 🚀 **Melhor performance**: Otimizado para TypeScript e ESM

## Migração Concluída

✅ `package.json` atualizado com scripts Bun  
✅ `bunfig.toml` criado com configurações  
✅ `.gitignore` atualizado  
✅ Arquivos Yarn removidos  

**Próximo passo**: Execute `bun install` para instalar as dependências.
