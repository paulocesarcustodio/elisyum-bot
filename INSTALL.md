# 🚀 Instalação Rápida - Elisyum Bot

## Um Comando, Tudo Instalado!

```bash
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh | bash
```

**Isso vai:**
- ✅ Clonar o repositório automaticamente
- ✅ Instalar Bun (se necessário)
- ✅ Instalar FFmpeg
- ✅ Instalar todas as dependências
- ✅ Compilar o TypeScript
- ✅ Criar estrutura de diretórios
- ✅ Criar arquivo `.env` template

---

## Após a Instalação

### 1️⃣ Entre no diretório
```bash
cd elisyum-bot
```

### 2️⃣ Configure o `.env`
```bash
nano .env
```

**Configurações importantes:**
```env
# Números dos administradores (com código do país)
ADMIN_NUMBERS="5519983084398"

# API Deepgram (opcional - para transcrição de áudio)
DEEPGRAM_API_KEY=""
```

### 3️⃣ Inicie o bot
```bash
bun start
```

Para trocar o número conectado sem apagar os áudios salvos:
```bash
bun start -- --clear-session
# ou apenas limpar a sessão e sair
bun run session:clear
```

### 4️⃣ Escaneie o QR Code
Use seu WhatsApp para escanear o código que aparecerá no terminal.

---

## 🎯 Pronto!

Agora você pode usar comandos como:
- `!menu` - Ver todos os comandos
- `!save` - Salvar áudios
- `!a` - Reproduzir ou listar áudios salvos
- `!p` - Baixar áudio do YouTube
- `!mp3` - Converter vídeo em áudio
- Enviar link suportado - Baixar automaticamente
- E muito mais!

---

## 📖 Documentação Completa

- [INSTALLATION.md](docs/guides/INSTALLATION.md) - Guia detalhado
- [COMANDOS.md](docs/reference/COMANDOS.md) - Lista de comandos
- [README.md](README.md) - Informações gerais

---

## ⚠️ Problemas?

Se algo der errado, veja a [documentação completa](docs/guides/INSTALLATION.md#-solução-de-problemas) ou abra uma [issue no GitHub](https://github.com/paulocesarcustodio/elisyum-bot/issues).

---

## 🔒 Segurança

Se preferir revisar o script antes de executar:

```bash
# Baixe o script
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh -o install.sh

# Revise o conteúdo
cat install.sh

# Execute manualmente
chmod +x install.sh
./install.sh
```
