<p align="center">
<img src="https://img95.pixhost.to/images/1083/472612217_8876.jpg" width="350" height="350"/>
</p>
<h1 align="center">🤖 Elisyum Bot - Robô para WhatsApp</h1>
<p align="center">
<a href="https://imgbb.com/"><img src="https://i.ibb.co/F4ZHtvCT/elisyum-logo.jpg" alt="elisyum-logo" border="0"></a>
<a href="https://github.com/victorsouzaleal/followers"><img title="Seguidores" src="https://img.shields.io/github/followers/victorsouzaleal?label=seguidores&style=flat&color=#79C83D"/></a>
<a href="https://github.com/victorsouzaleal/lbot-whatsapp/stargazers/"><img title="Estrelas" src="https://img.shields.io/github/stars/victorsouzaleal/lbot-whatsapp?label=estrelas&style=flat&color=#79C83D"></a>
<a href="https://github.com/victorsouzaleal/lbot-whatsapp/watchers"><img title="Acompanhando" src="https://img.shields.io/github/watchers/victorsouzaleal/lbot-whatsapp?label=acompanhando&style=flat&color=#79C83D"></a>
<a href="https://github.com/victorsouzaleal"><img title="Autor" src="https://img.shields.io/badge/autor-victorsouzaleal-blue.svg?logo=github&color=#79C83D"></a>
</p>

<br>
<h2 align="center"> Esse projeto não está sendo mais atualizado</h2>
<h2 align="center"> 🔄 Notas de atualização: <a href="docs/releases/CHANGELOG.md">AQUI</a></h2>

<br>

## 🚨 REQUERIMENTOS
- Conhecimento básico de informática. <br>
- Um **número de celular conectado ao WhatsApp** para conectar o bot. <br>
- Um **computador com sistema Windows/Linux** ou um **smartphone Android** para executar a aplicação.<br>

<br>

## 💿 Instalação

### 🖥️ Desktop (Windows/Linux)

Antes da instalação você tem que instalar os programas abaixo, no Windows é só instalar pelo link indicado e no Linux você tem que pesquisar qual é o comando para instalar na sua distribuição.
- Git 64-bit - [DOWNLOAD](https://git-scm.com/downloads/win)<br>
- Node.js (>= 20) - [DOWNLOAD](https://nodejs.org/en/)<br>
- FFmpeg - [DOWNLOAD](https://ffmpeg.org/download.html) (necessário para conversão de áudio/vídeo)<br>
  - **Windows**: Baixe o build e adicione ao PATH do sistema
  - **Linux/Ubuntu/Debian**: `sudo apt install ffmpeg`
  - **Linux/Fedora**: `sudo dnf install ffmpeg`
  - **macOS**: `brew install ffmpeg`<br><br>

Faça o download do **.zip** da última versão lançada [AQUI](https://github.com/victorsouzaleal/lbot-whatsapp/releases/latest), extraia o **.zip** e abra o **terminal/prompt de comando** dentro do local extraído.

<br>

**TODOS OS COMANDOS ABAIXO DEVEM SER EXECUTADOS NO TERMINAL/PROMPT DE COMANDO DENTRO DA PASTA EXTRAÍDA DO BOT!!** 

<br>

Se for a sua primeira vez instalando o bot você vai ter que digitar esse comando para instalar o **Yarn**
```bash
npm i -g yarn
```

**OBS**: Caso o comando retorne erro no **Linux** você vai precisar se elevar a superusuário utilizando **sudo** antes do comando.

<br>

> ℹ️ Este projeto utiliza **Yarn 4 (node-modules linker)** como gerenciador oficial. Mantenha o `yarn.lock` versionado, execute `yarn install` sempre que atualizar o repositório e evite usar `npm install`, pois o `package-lock.json` não é mais distribuído.

<br>

Após instalar o **Yarn** ou se ele já tiver instalado, você só precisa iniciar o bot com o comando abaixo:
```bash
yarn start
```

<br>

É normal demorar na primeira vez será feito o download de todas as dependências, se tudo der certo será perguntado se você quer se conectar com **QR Code** ou **Código de Pareamento**, faça a sua escolha e se conecte com o aplicativo do WhatsApp. 

<br>

### 📱 Smartphone (Android)

Faça a instalação do .apk mais atual do Termux: [AQUI](https://github.com/termux/termux-app/releases/download/v0.118.2/termux-app_v0.118.2+github-debug_universal.apk).

Abra o **Termux** comece usando este comando para fazer o download e instalação do bot, isso pode demorar algum tempo até instalar tudo.
```bash
pkg install wget -y && wget -O - tinyurl.com/lbot-termux | bash && cd ~/LBOT && yarn start
```
<br>

É normal demorar na primeira vez será feito o download de todas as dependências, se tudo der certo será perguntado se você quer se conectar com **QR Code** ou **Código de Pareamento**, faça a sua escolha e se conecte com o aplicativo do WhatsApp. 

<br>
<br>

Caso você feche o Termux e queira iniciar o bot novamente faça o comando abaixo:
```bash
cd ~/LBOT && yarn start
```

<br>
<br>

## 🗂️ Estrutura do projeto

- `src/` — código-fonte TypeScript organizado em controllers, services, eventos e utilitários.
- `dist/` — saída compilada pelo TypeScript após o `yarn build`.
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
Diversos comandos para download de mídias das principais redes sociais : X, Youtube, Instagram, TikTok...

### ⚒️ Utilidades Gerais
Diversos comandos de utilidades como encurtar link, editar áudio, obter letra de música, etc...

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

- O pacote `libsignal` exigido pelo Baileys é obtido diretamente do repositório oficial [`whiskeysockets/libsignal-node`](https://github.com/whiskeysockets/libsignal-node) com o commit `e81ecfc3`. O `yarn.lock` já referencia essa origem e dispensa hashes adicionais desde que a instalação seja feita via Yarn 4.

### 🔌 Dependências opcionais do Baileys 7

- **`sharp`** agora é instalado como dependência opcional para destravar a geração de miniaturas automática em imagens, stickers e fotos de perfil. O próprio README do Baileys recomenda instalar `jimp` ou `sharp`, além de `ffmpeg` para miniaturas de vídeo.【F:node_modules/@whiskeysockets/baileys/README.md†L730-L732】 Na prática, o fallback do Baileys para `jimp` falha com a versão 1.x usada pelo projeto e resulta em `No image processing library available` sem `sharp`.【F:node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js†L17-L134】【fa6285†L9-L27】 Com `sharp` presente, a biblioteca consegue extrair uma miniatura de 64px do asset `src/media/cara.png` em ~197 ms neste ambiente.【c1a3e4†L1-L12】
- **`audio-decode`** é carregado sob demanda pelo Baileys para gerar a waveform exibida pelo WhatsApp ao enviar áudios/ptt.【F:node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js†L200-L238】 O teste automatizado `tests/baileys.media.peers.test.ts` cria um WAV sintético e valida que recebemos 64 amostras normalizadas (0-100) quando a dependência está instalada.【F:tests/baileys.media.peers.test.ts†L1-L45】【792947†L1-L33】
- **`link-preview-js`** continua opcional, mas documentado. Ele permite que `getUrlInfo` gere metadados e miniaturas de links quando o texto enviado contém URLs.【F:node_modules/@whiskeysockets/baileys/README.md†L600-L611】【F:node_modules/@whiskeysockets/baileys/lib/Utils/link-preview.js†L17-L84】 Em ambientes sem acesso externo, as prévias simplesmente não são geradas; mantenha a dependência instalada para fluxos que dependem disso.
- **`@ffmpeg-installer/ffmpeg`** permanece como fallback interno quando o binário do sistema não está disponível. Ainda assim, recomendamos instalar o `ffmpeg` do sistema operacional para aproveitar aceleração por hardware quando possível.【F:node_modules/@whiskeysockets/baileys/README.md†L730-L732】 Em caso de erro, o Baileys continua registrando logs e tenta prosseguir com o envio.

> ℹ️ **Política adotada:** essas bibliotecas ficam em `optionalDependencies`. O Yarn 4 as instala automaticamente quando o ambiente suporta os binários pré-compilados (como o `sharp`). Caso uma delas falhe na instalação, o `yarn install` continuará, mas o recurso correspondente ficará indisponível até que a dependência seja instalada manualmente.

### 📣 Monitoramento de canais/newsletters

- O mapa de eventos do Baileys 7 inclui as notificações de canais `chats.update`, `messages.upsert`, `newsletter.view`, `newsletter-participants.update` e `newsletter-settings.update`, que chegam via `client.ev.process` ao lado dos eventos tradicionais de chat.【F:node_modules/@whiskeysockets/baileys/lib/Types/Events.d.ts†L27-L132】
- O bot identifica JIDs de canais (`@newsletter`) com o utilitário exposto pela própria biblioteca e encaminha essas mensagens para loggers dedicados, preservando o fluxo de comandos padrão até que novas automações sejam habilitadas.【F:node_modules/@whiskeysockets/baileys/lib/WABinary/jid-utils.js†L58-L59】【F:src/socket.ts†L60-L114】【F:src/events/newsletter-message.event.ts†L1-L55】【F:src/events/newsletter-chats-update.event.ts†L1-L29】【F:src/events/newsletter-update.event.ts†L1-L25】

<br>

## 🙏 Agradecimentos

* A minha mãe e o meu pai que me fizeram com muito amor
* [`WhiskeySockets/Baileys`](https://github.com/WhiskeySockets/Baileys) - Por disponibilizar a biblioteca Baileys e dar suporte no Discord principalmente a nós brasileiros.
