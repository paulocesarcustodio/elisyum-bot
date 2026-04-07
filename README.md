<p align="center">
<img src="https://i.ibb.co/F4ZHtvCT/elisyum-logo.jpg" width="350" height="350"/>
</p>
<h1 align="center">🤖 Elisyum Bot - Robô para WhatsApp</h1>

<div align="center">

[![Instalação com 1 comando](https://img.shields.io/badge/Instalação-1%20comando-brightgreen?style=for-the-badge)](INSTALL.md)
[![Documentação](https://img.shields.io/badge/Docs-Completa-blue?style=for-the-badge)](docs/guides/INSTALLATION.md)
[![License](https://img.shields.io/badge/License-GPL--3.0-red?style=for-the-badge)](LICENSE)

### 🚀 Instale agora com um único comando!

```bash
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh | bash
```

</div>

<br>
<h2 align="center"> 🔄 Notas de atualização: <a href="docs/releases/CHANGELOG.md">AQUI</a></h2>

<br>

## 🚨 REQUERIMENTOS
- Conhecimento básico de informática. <br>
- Um **número de celular conectado ao WhatsApp** para conectar o bot. <br>
- Um **computador com sistema Windows/Linux** ou um **smartphone Android** para executar a aplicação.<br>

<br>

## 💿 Instalação

### 🚀 Instalação com Um Comando (Linux/macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh | bash
```

**Após a instalação:**
```bash
# Opção 1: Use o script run.sh (não precisa recarregar shell!)
cd elisyum-bot
nano .env          # Configure suas variáveis
./run.sh           # Inicia com CLI colorida ✨

# Opção 2: Recarregue o shell e use bun
source ~/.bashrc
cd elisyum-bot
nano .env
bun start          # Também usa CLI colorida! 🎨
bun run start:fresh # Limpa a sessão e inicia para conectar outro número
```

**Instalação local com CLI bonita:**
```bash
git clone https://github.com/paulocesarcustodio/elisyum-bot.git
cd elisyum-bot
bun setup.js       # Setup com interface colorida
bun start          # Inicia com banner bonito
bun run session:clear # Limpa a sessão sem iniciar
```

O script instala automaticamente:
- ✅ Clona o repositório
- ✅ Bun runtime
- ✅ FFmpeg
- ✅ Dependências do Canvas (Linux)
- ✅ Todas as dependências npm
- ✅ SQLite (integrado no Bun)
- ✅ Compila o TypeScript

📖 **Guia completo**: [docs/guides/INSTALLATION.md](docs/guides/INSTALLATION.md)

---

### 🖥️ Instalação Manual (Windows/Linux)

Antes da instalação você tem que instalar os programas abaixo, no Windows é só instalar pelo link indicado e no Linux você tem que pesquisar qual é o comando para instalar na sua distribuição.
- Git 64-bit - [DOWNLOAD](https://git-scm.com/downloads/win)<br>
- Bun (>= 1.0) - [DOWNLOAD](https://bun.sh/)<br>
  - **Windows/Linux/macOS**: `curl -fsSL https://bun.sh/install | bash`<br>
- FFmpeg - [DOWNLOAD](https://ffmpeg.org/download.html) (necessário para conversão de áudio/vídeo)<br>
  - **Windows**: Baixe o build e adicione ao PATH do sistema
  - **Linux/Ubuntu/Debian**: `sudo apt install ffmpeg`
  - **Linux/Fedora**: `sudo dnf install ffmpeg`
  - **macOS**: `brew install ffmpeg`<br><br>

Faça o download do **.zip** da última versão lançada [AQUI](https://github.com/victorsouzaleal/lbot-whatsapp/releases/latest), extraia o **.zip** e abra o **terminal/prompt de comando** dentro do local extraído.

<br>

**TODOS OS COMANDOS ABAIXO DEVEM SER EXECUTADOS NO TERMINAL/PROMPT DE COMANDO DENTRO DA PASTA EXTRAÍDA DO BOT!!** 

<br>

> ℹ️ Este projeto utiliza **Bun** como runtime e gerenciador de pacotes oficial. Execute `bun install` sempre que atualizar o repositório.

<br>

Após instalar o **Bun**, você só precisa iniciar o bot com o comando abaixo:
```bash
bun start
```

Para trocar o número conectado ao bot sem apagar seus áudios ou o `bot.db`:
```bash
bun start -- --clear-session
# ou apenas limpar e sair
bun run session:clear
```

<br>

É normal demorar na primeira vez será feito o download de todas as dependências, se tudo der certo será perguntado se você quer se conectar com **QR Code** ou **Código de Pareamento**, faça a sua escolha e se conecte com o aplicativo do WhatsApp. 

<br>

### 📱 Smartphone (Android)

Faça a instalação do .apk mais atual do Termux: [AQUI](https://github.com/termux/termux-app/releases/download/v0.118.2/termux-app_v0.118.2+github-debug_universal.apk).

Abra o **Termux** comece usando este comando para fazer o download e instalação do bot, isso pode demorar algum tempo até instalar tudo.
```bash
pkg install wget -y && wget -O - tinyurl.com/lbot-termux | bash && cd ~/LBOT && bun start
```
<br>

É normal demorar na primeira vez será feito o download de todas as dependências, se tudo der certo será perguntado se você quer se conectar com **QR Code** ou **Código de Pareamento**, faça a sua escolha e se conecte com o aplicativo do WhatsApp. 

<br>
<br>

Caso você feche o Termux e queira iniciar o bot novamente faça o comando abaixo:
```bash
cd ~/LBOT && bun start
```

<br>
<br>

## 🗂️ Estrutura do projeto

- `src/` — código-fonte TypeScript organizado em controllers, services, eventos e utilitários.
- `dist/` — saída compilada pelo TypeScript após o `bun run build`.
- `bin/` — binários auxiliares versionados, como o `yt-dlp` local usado nos downloads.
- `scripts/` — utilitários para manutenção:
  - `setup/` contém `deploy.sh` e `install-ytdlp.js` para preparar o ambiente.
  - `manual-tests/` reúne os testes exploratórios de comandos e downloads.
  - `tooling/` guarda scripts de suporte e inspeção de dependências.
- `docs/` — documentação dividida em `guides/`, `reference/`, `releases/` e `proposals/`.

<br>

## 🤖 Uso

Seu bot já deve estar iniciando normalmente após o passo anterior, use os comandos abaixo para visualizar os comandos disponíveis.

<br>

**!menu** - Dá acesso ao **menu principal**.<br>
**!admin** - Dá acesso ao **menu de administrador**.

Para downloads, você também pode simplesmente enviar um link suportado no chat que o bot faz o download automaticamente.

<br>

Todos os comandos tem um guia ao digitar: **!comando** guia

<br>

## ⚙️ Administração do bot/grupo

Como ver os comandos de administração geral do **BOT**? <br>
Envie **!admin** para o WhatsApp do bot e seu número será cadastrado como dono, após ser cadastrado você pode usar o **!admin** para ter acesso ao **menu do administrador**

<br>

Como ver os comandos de administração do **GRUPO**? <br>
Se você for administrador do grupo envie **!menu 5** dentro de um grupo para ter acesso ao menu completo do grupo, caso você não seja administrador do grupo você só terá acesso a um menu limitado.

<br>

## 🛠️ Recursos/Comandos

### 🖼️ Figurinhas
Diversos comandos para criação de figurinhas

### 📥 Downloads 
Downloads automáticos ao detectar links suportados e comandos como `!d`, `!p` e `!mp3` para mídias das principais redes sociais: X, YouTube, Instagram, TikTok...

### ⚒️ Utilidades Gerais
Diversos comandos de utilidades como `!a` para áudios salvos, encurtar link, editar áudio, obter letra de música, etc...

### 👾 Entretenimento
Diversos comandos para entretenimento do grupo

### 👨‍👩‍👦‍👦 Administração de Grupo
Diversos comandos de grupo para ajudar na administração. Agora inclui o `!silenciar`, que permite alternar rapidamente o mute individual respondendo ou marcando o membro alvo.

### ⚙️ Administração geral do bot
Diversos para administrar o bot e ter controle sobre ele.

<br>

### 👉 Lista completa de comandos... [Clique Aqui](docs/reference/COMANDOS.md)

<br>

## 🧰 Notas técnicas

- O pacote `libsignal` exigido pelo Baileys é obtido diretamente do repositório oficial [`whiskeysockets/libsignal-node`](https://github.com/whiskeysockets/libsignal-node) com o commit `e81ecfc3`.

### 🔌 Dependências opcionais do Baileys 7

- **`sharp`** agora é instalado como dependência opcional para destravar a geração de miniaturas automática em imagens, stickers e fotos de perfil. O próprio README do Baileys recomenda instalar `jimp` ou `sharp`, além de `ffmpeg` para miniaturas de vídeo.【F:node_modules/@whiskeysockets/baileys/README.md†L730-L732】 Na prática, o fallback do Baileys para `jimp` falha com a versão 1.x usada pelo projeto e resulta em `No image processing library available` sem `sharp`.【F:node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js†L17-L134】【fa6285†L9-L27】 Com `sharp` presente, a biblioteca consegue extrair uma miniatura de 64px do asset `src/media/cara.png` em ~197 ms neste ambiente.【c1a3e4†L1-L12】
- **`audio-decode`** é carregado sob demanda pelo Baileys para gerar a waveform exibida pelo WhatsApp ao enviar áudios/ptt.【F:node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js†L200-L238】 O teste automatizado `tests/baileys.media.peers.test.ts` cria um WAV sintético e valida que recebemos 64 amostras normalizadas (0-100) quando a dependência está instalada.【F:tests/baileys.media.peers.test.ts†L1-L45】【792947†L1-L33】
- **`link-preview-js`** continua opcional, mas documentado. Ele permite que `getUrlInfo` gere metadados e miniaturas de links quando o texto enviado contém URLs.【F:node_modules/@whiskeysockets/baileys/README.md†L600-L611】【F:node_modules/@whiskeysockets/baileys/lib/Utils/link-preview.js†L17-L84】 Em ambientes sem acesso externo, as prévias simplesmente não são geradas; mantenha a dependência instalada para fluxos que dependem disso.
- **`@ffmpeg-installer/ffmpeg`** permanece como fallback interno quando o binário do sistema não está disponível. Ainda assim, recomendamos instalar o `ffmpeg` do sistema operacional para aproveitar aceleração por hardware quando possível.【F:node_modules/@whiskeysockets/baileys/README.md†L730-L732】 Em caso de erro, o Baileys continua registrando logs e tenta prosseguir com o envio.

> ℹ️ **Política adotada:** essas bibliotecas ficam em `optionalDependencies`. O Bun as instala automaticamente quando o ambiente suporta os binários pré-compilados (como o `sharp`). Caso uma delas falhe na instalação, o `bun install` continuará, mas o recurso correspondente ficará indisponível até que a dependência seja instalada manualmente.

### 📣 Monitoramento de canais/newsletters

- O mapa de eventos do Baileys 7 inclui as notificações de canais `chats.update`, `messages.upsert`, `newsletter.view`, `newsletter-participants.update` e `newsletter-settings.update`, que chegam via `client.ev.process` ao lado dos eventos tradicionais de chat.【F:node_modules/@whiskeysockets/baileys/lib/Types/Events.d.ts†L27-L132】
- O bot identifica JIDs de canais (`@newsletter`) com o utilitário exposto pela própria biblioteca e encaminha essas mensagens para loggers dedicados, preservando o fluxo de comandos padrão até que novas automações sejam habilitadas.【F:node_modules/@whiskeysockets/baileys/lib/WABinary/jid-utils.js†L58-L59】【F:src/socket.ts†L60-L114】【F:src/events/newsletter-message.event.ts†L1-L55】【F:src/events/newsletter-chats-update.event.ts†L1-L29】【F:src/events/newsletter-update.event.ts†L1-L25】

<br>

## 🙏 Agradecimentos

* A minha mãe e o meu pai que me fizeram com muito amor
* [`WhiskeySockets/Baileys`](https://github.com/WhiskeySockets/Baileys) - Por disponibilizar a biblioteca Baileys e dar suporte no Discord principalmente a nós brasileiros.

## 🚀 Webhook Deploy

O projeto inclui um servidor webhook (`webhook-deploy.js`) para automatizar deploys a partir de pushes no GitHub.

### Configuração

1. Configure as variáveis de ambiente:
   ```bash
   WEBHOOK_PORT=3001          # Porta do servidor webhook
   WEBHOOK_SECRET=your-secret # Secret do webhook do GitHub
   DEPLOY_PATH=/path/to/bot   # Caminho do projeto no servidor
   ```

2. Configure o webhook no GitHub:
   - Vá em Settings > Webhooks > Add webhook
   - URL: `http://SEU_IP:3001/webhook` (use a porta configurada em `WEBHOOK_PORT`)
   - Content type: `application/json`
   - Secret: o mesmo configurado em `WEBHOOK_SECRET`
   - Events: Apenas o evento push

3. Inicie o servidor webhook:
   ```bash
   bun webhook-deploy.js
   ```

### Funcionamento

O webhook escuta por pushes na branch `main` e executa automaticamente:
- `git pull origin main`
- `bun install --frozen-lockfile`
- `bun run preflight:storage`
- `bun run build`
- `systemctl restart lbot` (reinicia o serviço do bot)
