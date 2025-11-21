# 🚀 Instalação do Elisyum Bot

Este guia explica como instalar e configurar o bot do zero.

## 📋 Pré-requisitos

- **Sistema Operacional**: Linux (Ubuntu/Debian), macOS, ou WSL no Windows
- **Node.js**: Não é necessário, usamos Bun!
- **Git**: Para clonar o repositório

## 🛠️ Instalação Rápida

### Opção 1: Um Comando Só (Mais Fácil!)

```bash
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh | bash
```

**⚠️ IMPORTANTE:** Após a instalação, recarregue o shell:
```bash
source ~/.bashrc
```

Este comando único:
- 📥 Clona o repositório automaticamente
- 🔧 Instala todas as dependências (Bun, FFmpeg, etc)
- 🏗️ Compila o projeto
- ✅ Adiciona Bun ao PATH permanentemente

### Opção 2: Clonar Primeiro (Mais Seguro)

Se preferir revisar o script antes de executar:

```bash
# 1. Clone o repositório
git clone https://github.com/paulocesarcustodio/elisyum-bot.git
cd elisyum-bot

```

O script automaticamente:
- ✅ Instala o Bun (se necessário)
- ✅ Instala FFmpeg para conversão de mídia
- ✅ Instala dependências do Canvas (Linux)
- ✅ Instala todas as dependências npm
- ✅ Cria estrutura de diretórios necessária
- ✅ Cria arquivo `.env` template
- ✅ Compila o TypeScript
- ✅ **SQLite já vem integrado no Bun** (não precisa instalar)

```bash
./scripts/setup/install.sh
```

---

### Depois da Instalação

### 1. Configure o arquivo `.env`

Edite o arquivo `.env` criado:

```bash
nano .env
```

Configurações importantes:

```env
# Nome do bot
BOT_NAME="Elisyum Bot"

# Prefixo dos comandos
BOT_PREFIX="!"

# Números dos administradores (com código do país, sem + ou espaços)
ADMIN_NUMBERS="5519983084398,5519912345678"

# API Deepgram para transcrição de áudio (opcional)
# Obtenha em: https://deepgram.com
DEEPGRAM_API_KEY="sua_chave_aqui"

# Debug (opcional)
DEBUG=false
```

### 2. Inicie o bot

```bash
cd elisyum-bot  # Se ainda não estiver no diretório

# Opção 1: Use o script auxiliar (recomendado)
./start-bot.sh

# Opção 2: Use bun diretamente
bun start
```

**Se `bun: command not found`:**
```bash
# Recarregue o shell
source ~/.bashrc

# Ou adicione ao PATH manualmente nesta sessão
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Escaneie o QR Code que aparecerá no terminal com seu WhatsApp.

---

## 📦 Banco de Dados SQLite

O bot usa **SQLite embutido no Bun** (`bun:sqlite`), não é necessário instalar nada extra!

### Estrutura do Banco

O banco de dados é criado automaticamente em `storage/bot.db` com três tabelas:

#### 1. **contacts** - Cache de contatos do WhatsApp
```sql
CREATE TABLE contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    notify TEXT,
    verified_name TEXT,
    phone_number TEXT,
    lid TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. **command_logs** - Logs de execução de comandos
```sql
CREATE TABLE command_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    user_name TEXT,
    command TEXT NOT NULL,
    args TEXT,
    chat_id TEXT,
    is_group BOOLEAN DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT 1,
    error_message TEXT
);
```

#### 3. **saved_audios** - Áudios salvos pelos usuários
```sql
CREATE TABLE saved_audios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    audio_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    seconds INTEGER,
    ptt BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_jid, audio_name)
);
```

### Consultar o Banco

```bash
# Instalar sqlite3 CLI (opcional, só para consultas manuais)
sudo apt-get install sqlite3

# Abrir o banco
sqlite3 storage/bot.db

# Exemplos de consultas
sqlite> SELECT COUNT(*) FROM contacts;
sqlite> SELECT * FROM command_logs ORDER BY timestamp DESC LIMIT 10;
sqlite> SELECT user_jid, audio_name FROM saved_audios;
sqlite> .quit
```

### Backup do Banco

```bash
# Backup simples
cp storage/bot.db storage/bot.db.backup

# Backup com timestamp
cp storage/bot.db storage/bot.db.$(date +%Y%m%d_%H%M%S)

# Exportar para SQL
sqlite3 storage/bot.db .dump > backup.sql

# Restaurar do SQL
sqlite3 storage/bot.db < backup.sql
```

## 🔧 Instalação Manual (sem script)

### 1. Instalar Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Instalar FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

### 3. Instalar dependências do Canvas (Linux)

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### 4. Instalar dependências do projeto

```bash
bun install
```

### 5. Criar diretórios

```bash
mkdir -p storage storage/audios session temp logs/session
```

### 6. Build

```bash
bun run build
```

## 🐳 Instalação com Docker (Futuro)

```bash
# TODO: Adicionar Dockerfile
docker-compose up -d
```

## 🔄 Atualização

Para atualizar o bot para a versão mais recente:

```bash
git pull origin main
bun install
bun run build
bun start
```

## ⚙️ Comandos Úteis

```bash
# Iniciar o bot
bun start

# Modo desenvolvimento (recompila automaticamente)
bun run dev

# Apenas compilar TypeScript
bun run build

# Executar migrações do banco
bun run migrate

# Limpar arquivos compilados
bun run clean
```

## 📂 Estrutura de Diretórios

```
elisyum-bot/
├── storage/            # Dados persistentes
│   ├── bot.db         # Banco SQLite
│   ├── bot.json       # Configurações do bot
│   └── audios/        # Áudios salvos pelos usuários
├── session/           # Sessão do WhatsApp
├── temp/              # Arquivos temporários
├── logs/              # Logs de execução
├── dist/              # Código compilado
├── src/               # Código TypeScript
├── scripts/           # Scripts auxiliares
│   └── setup/
│       ├── install.sh       # Script de instalação
│       └── install-ytdlp.js # Instalador do yt-dlp
└── docs/              # Documentação
```

## 🚨 Solução de Problemas

### Erro: "Bun command not found"

Adicione o Bun ao PATH:

```bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Erro no Canvas (Linux)

Instale as dependências:

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Erro: "Cannot find module"

Reinstale as dependências:

```bash
rm -rf node_modules bun.lockb
bun install
```

### Banco de dados corrompido

Restaure do backup:

```bash
cp storage/bot.db.backup storage/bot.db
```

Ou delete e deixe recriar:

```bash
rm storage/bot.db
bun start  # Recria automaticamente
```

## 📞 Suporte

- **GitHub Issues**: [github.com/paulocesarcustodio/elisyum-bot/issues](https://github.com/paulocesarcustodio/elisyum-bot/issues)
- **Documentação**: Veja os arquivos em `/docs`

## 📝 Licença

GPL-3.0-only - Veja o arquivo [LICENSE](../../LICENSE)
