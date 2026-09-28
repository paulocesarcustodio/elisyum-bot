# Instalação e atualização do Elisyum Bot

O mesmo instalador prepara uma máquina nova ou atualiza uma instalação PostgreSQL existente. O `git pull` não executa scripts automaticamente: depois dele, rode o setup abaixo.

## Pré-requisitos do sistema

Ambiente validado: **Ubuntu 24.04 x86-64 com Python 3.12** (também em WSL2). Execute o setup como usuário comum, pois PostgreSQL não permite execução como root. O instalador confere as ferramentas antes de parar uma instalação ativa. Se necessário, instale os pré-requisitos:

```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip python3-dev build-essential pkg-config bison flex libicu-dev zlib1g-dev libssl-dev ffmpeg libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

Esses pacotes são ferramentas e bibliotecas; o PostgreSQL usado pelo bot é compilado dentro do projeto. O setup não instala nem habilita serviços do sistema. Os binários dos modelos atuais são para Linux x86-64; macOS, Windows nativo e Android não fazem parte deste instalador.

## Configuração recomendada para CPU

No Proxmox, reserve **12 vCPU, 24 GiB de RAM, 2 GiB de swap e 100 GiB de disco em SSD**. Na tela de memória, 24 GiB correspondem a 24576 MiB. Para um disco atual de 30 GiB, acrescente 70 GiB se o campo pedir o incremento. Esses recursos são configurados no Proxmox; o setup dentro do container não altera o host.

O setup instala **Qwen3.5-4B Q4_K_M** e **Whisper medium int8**, com revisões e SHA-256 fixados em `scripts/runtime-manifest.json`. Qwen usa CPU, 4 threads, contexto de 6144 tokens, um slot e raciocínio desativado. Whisper usa CPU, 4 threads e uma transcrição por vez. Os prazos máximos de resposta são 60 segundos para classificação e 120 segundos para transcrição; não são estimativas de latência. Áudios de comando continuam limitados a 15 segundos.

Os novos pesos e configurações ocupam aproximadamente **4,3 GB** (4,0 GiB); banco, dependências, mídia temporária e backups usam o restante do disco. Os arquivos antigos de modelos são preservados na atualização. Após o download, a inferência funciona offline. A capacidade e a velocidade devem ser medidas com a carga real do servidor.

## Primeira instalação

```bash
git clone https://github.com/paulocesarcustodio/elisyum-bot.git
cd elisyum-bot
bash scripts/setup/install.sh --start
```

O processo automatiza:

1. Verificação dos pré-requisitos e encerramento de um runtime existente.
2. Bun 1.4.0 em `codex-scripts/bun/bin/bun` e PostgreSQL 18.6 em `codex-scripts/postgres`.
3. Dependências do bot e painel pelos lockfiles, ambiente Python e modelos com versões e hashes fixados.
4. Configurações privadas, cluster PostgreSQL, banco, papéis e migrações.
5. Compilação do bot e painel; com `--start`, execução de todos os processos no terminal.

O primeiro setup baixa modelos grandes e compila PostgreSQL; pode demorar. Repetições reutilizam downloads válidos e preservam banco, sessão e configurações. Uma falha encerra o fluxo sem iniciar o bot parcialmente preparado; consulte a mensagem e execute novamente após corrigir a causa.

Na primeira conexão, faça o pareamento do WhatsApp no terminal. O painel fica em <http://localhost:3000>. O cadastro público é desabilitado: a primeira conta administrativa deve ser definida pelo proprietário. O setup não cria um usuário ou senha fictícios.

## Atualização após pull

```bash
git pull
bash scripts/setup/install.sh --start
```

A sequência é **parar → instalar dependências → preparar banco/aplicar migrações → compilar → iniciar**. Ctrl+C encerra os processos locais. A instalação em outra máquina não recebe sessão ou dados pelo Git: siga [backup e restauração](docs/operacao-local.md#backup-e-restauração).

## Opções e compatibilidade

```bash
bash scripts/setup/install.sh --check   # somente conferir pré-requisitos
bash scripts/setup/install.sh           # preparar e compilar, sem iniciar
python3 scripts/local-runtime.py start  # iniciar uma instalação pronta
```

Se já tiver Bun, `bun setup.js` ou `bun run setup` aceitam as mesmas opções. O antigo `scripts/setup/deploy.sh` também encaminha ao mesmo fluxo. Esses arquivos resolvem a pasta do projeto mesmo quando chamados de outro diretório.

A entrada remota continua disponível, usando os mesmos pré-requisitos:

```bash
curl -fsSL https://raw.githubusercontent.com/paulocesarcustodio/elisyum-bot/main/scripts/setup/install.sh | bash
```

Ela prepara o checkout local ou clona em `elisyum-bot`. Depois, inicie com `python3 scripts/local-runtime.py start` dentro do projeto. Não há alteração automática de `.bashrc`, instalação global de Bun ou gancho de Git.

## Instalações antigas e recuperação

Se houver SQLite (`storage/bot.db`) sem cluster PostgreSQL, o setup interrompe antes de modificar a instalação. Migre um snapshot consistente usando o procedimento de [operação local](docs/operacao-local.md). Não apague o SQLite para contornar a verificação.

Se o cluster existir e `codex-scripts/database.env` estiver ausente, restaure esse arquivo do backup; gerar novas senhas não recuperaria o acesso ao banco existente. Os arquivos privados e os modelos em `codex-scripts/`, o banco em `storage/` e o ambiente Python não são levados pelo Git.

[Operação, logs e backup](docs/operacao-local.md) · [Comandos do bot](docs/reference/COMANDOS.md)
