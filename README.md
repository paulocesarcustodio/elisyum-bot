> **Execução local atual:** PostgreSQL, bot, painel e modelos são controlados por `python3 scripts/local-runtime.py start`. Consulte [operação local](docs/operacao-local.md) e [implantação da arquitetura](docs/implantacao-arquitetura-2026-09-27.md) antes dos procedimentos legados abaixo.

<p align="center">
<img src="https://i.ibb.co/F4ZHtvCT/elisyum-logo.jpg" width="350" height="350"/>
</p>
<h1 align="center">🤖 Elisyum Bot - Robô para WhatsApp</h1>

<div align="center">

[![Instalação com 1 comando](https://img.shields.io/badge/Instalação-1%20comando-brightgreen?style=for-the-badge)](INSTALL.md)
[![Documentação](https://img.shields.io/badge/Docs-Completa-blue?style=for-the-badge)](docs/guides/INSTALLATION.md)
[![License](https://img.shields.io/badge/License-GPL--3.0-red?style=for-the-badge)](LICENSE)

### Instalação e atualização local

Ambiente validado: **Ubuntu 24.04 x86-64, Python 3.12**, incluindo WSL2. Os pré-requisitos do sistema estão no [guia de instalação](INSTALL.md).

</div>

Após clonar o repositório, execute:

```bash
bash scripts/setup/install.sh --start
```

O mesmo comando serve para preparar uma máquina nova e atualizar uma instalação PostgreSQL existente após `git pull`. Ele para o runtime, prepara Bun 1.4.0 e PostgreSQL locais, instala os pacotes pelos lockfiles, baixa os modelos com verificação de SHA-256, prepara banco e permissões, aplica migrações, compila bot e painel e inicia os processos no terminal. Ctrl+C encerra tudo.

O perfil padrão usa **Qwen3.5-4B Q4_K_M + Whisper medium int8 em CPU**. Reserve 24 GiB de RAM, 12 vCPU e 100 GiB de SSD no container; veja os detalhes em [configuração recomendada](INSTALL.md#configuração-recomendada-para-cpu).

Para apenas preparar, omita `--start`. Para verificar os pré-requisitos sem parar processos ou instalar nada:

```bash
bash scripts/setup/install.sh --check
```

`bun setup.js` e `bun run setup` usam o mesmo instalador. Não é necessário ter Bun previamente: a entrada Bash baixa a versão fixada para dentro do projeto. Nenhum serviço do sistema é criado e o instalador não altera o shell do usuário.

Na primeira conexão, faça o pareamento do WhatsApp pelo terminal. O painel fica em <http://localhost:3000>; a primeira conta administrativa precisa ser definida pelo proprietário. Configurações, sessão e banco existentes são preservados. O Git transporta o código; para levar os dados a outra máquina, use o [procedimento de backup e restauração](docs/operacao-local.md#backup-e-restauração).

Instalações antigas com `storage/bot.db` exigem migração explícita de um snapshot antes da inicialização. O setup identifica esse caso e interrompe sem apagar dados. A instalação atual não suporta os antigos atalhos de limpeza de sessão.

[Instalação completa](INSTALL.md) · [Operação local](docs/operacao-local.md) · [Notas de atualização](docs/releases/CHANGELOG.md)

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

Para downloads, basta enviar um link suportado no privado ou em um grupo: ele aciona `d` automaticamente, respeitando permissões e limites. Essa é a exceção à palavra de ativação “bot”; os demais pedidos em linguagem natural continuam exigindo-a.

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
Downloads automáticos ao detectar links suportados e comandos como `!d`, `!p` e `!mp3` para mídias das principais redes sociais: X, YouTube, Instagram, Facebook, TikTok e Pinterest (Pins públicos de imagem ou vídeo, incluindo links `pin.it`).

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

## Deploy legado

`webhook-deploy.js` e o `deploy.sh` da raiz pertencem à implantação antiga com systemd. Não fazem parte do runtime local atual. Para instalar ou atualizar esta arquitetura, use `bash scripts/setup/install.sh --start`; consulte [INSTALL.md](INSTALL.md).
