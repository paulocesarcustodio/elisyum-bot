# Operação local

O bot usa **PostgreSQL 18.6, Baileys 7.0.0-rc14, Drizzle 0.45.3, pg-boss 12.35.0 e Bun 1.4.0**. O executor controla banco, llama.cpp, Whisper, OpenJev, dois workers, painel Next.js e gateway WhatsApp em processos do terminal. Não instala serviços do sistema.

## Uso diário

Na raiz do projeto:

```bash
python3 scripts/local-runtime.py start
```

O painel fica em <http://localhost:3000>. Ctrl+C encerra primeiro o gateway, aguardando persistência da sessão, e depois os demais processos. Em outro terminal:

```bash
python3 scripts/local-runtime.py status
bun scripts/status-local.ts
python3 scripts/local-runtime.py stop
```

`status-local.ts` informa filas, resultados, latência média/p95 por etapa nas últimas 24 horas e saúde das APIs. Os logs ficam em `codex-scripts/{bot,postgres,media-worker,inference-worker,web,qwen,whisper,openjev}.log`, com rotação de 10 MB e três arquivos anteriores por processo. Eventos de operação e de trabalho usam JSON, identificadores correlacionáveis e duração. Logs legados de biblioteca ainda podem ser texto.

## Atualizar e compilar

Encerre o executor antes de alterar o build em uso. A sequência automatizada é:

```bash
python3 scripts/local-runtime.py restart
```

Ela executa **parar → instalar pelo lockfile → compilar bot e painel → iniciar**. `build` compila sem iniciar e recusa execução quando o lock do runtime está ocupado. `start` aplica migrações SQL antes de iniciar os consumidores. O gateway mantém um bloqueio PostgreSQL exclusivo por conta, com geração de conexão; um segundo gateway é recusado. O atualizador que baixava ZIPs automaticamente não é chamado.

As alterações de esquema têm origem em `src/database/schema.ts`; gere a migração na raiz com `bunx drizzle-kit generate`, revise o SQL em `migrations/` e aplique com `bun scripts/migrate-postgres.ts elysium`. O painel reexporta o esquema canônico. Não use o antigo `db:push` do painel nem scripts de migração SQLite em produção.

## Instalação reproduzível

Ambiente validado: Ubuntu 24.04 x86-64, Python 3.12. Consulte os pré-requisitos em [INSTALL.md](../INSTALL.md). O instalador deve ser executado como usuário comum.

```bash
bash scripts/setup/install.sh --check
bash scripts/setup/install.sh --start
```

Esse fluxo atende tanto a primeira instalação quanto a atualização após `git pull`: confere pré-requisitos, para o runtime, instala Bun 1.4.0 e PostgreSQL dentro do projeto, instala pacotes fixados, prepara automaticamente cluster/banco/papéis, aplica migrações, compila bot e painel e inicia tudo no mesmo terminal. Não exige um segundo terminal para bootstrap. Sem `--start`, prepara e termina com o runtime parado. `bun setup.js` e `bun run setup` são entradas equivalentes.

As bibliotecas JavaScript ficam em `bun.lock` e `web/bun.lock`; Python fica em `whisper-service/requirements.lock.txt`. O instalador verifica SHA-256 dos downloads e reutiliza arquivos válidos. `scripts/runtime-manifest.json` fixa Bun, pesos e revisões: Qwen3.5-4B Q4_K_M, llama.cpp b11222, faster-whisper medium int8 e OpenJev no commit registrado. Modelos executam offline após o download. A extração auxiliar de compiladores usa pacotes Ubuntu 24.04 amd64; outras distribuições devem disponibilizar bison/flex no PATH e não foram validadas.

O setup preserva configurações existentes e não altera `.bashrc`, instala pacotes globais nem cria serviços. Instalações SQLite sem cluster PostgreSQL exigem a migração explícita de um snapshot; o setup interrompe antes de alterar esse caso. Um cluster existente sem suas credenciais também interrompe o fluxo para permitir restaurar o backup.

`codex-scripts/database.env` guarda as credenciais separadas de gateway, worker e painel. `codex-scripts/web.env` guarda a origem e o segredo de autenticação do painel. Esses arquivos usam permissão 600; dados do cluster e backups são privados. O painel não permite cadastro público. O primeiro acesso administrativo precisa de uma conta explicitamente definida pelo proprietário; o instalador não inventa identidade ou senha de usuário.

O endereço do painel deve coincidir com `BETTER_AUTH_URL` (padrão `http://localhost:3000`). Os processos escutam apenas em loopback. A instalação atual usa uma conta WhatsApp; alguns cadastros legados ainda são globais, portanto não se deve habilitar várias contas apenas mudando `BOT_ACCOUNT_ID`.

## Backup e restauração

Com o banco local ativo:

```bash
bun scripts/backup-postgres.ts create
bun scripts/backup-postgres.ts verify /caminho/do/backup
```

`create` usa um snapshot PostgreSQL compartilhado com `pg_dump`, copia mídias imutáveis e configurações e grava hashes. A coleta de arquivos aguarda o backup. `verify` restaura em **outra base temporária**, compara contagens e hashes de todas as tabelas, incluindo credenciais, confere os arquivos e remove somente essa base de teste. Nenhuma restauração sobrescreve produção automaticamente. Guarde os backups em local privado e faça uma cópia em outro disco; eles contêm a sessão WhatsApp e os segredos do painel.

Para recuperar a instalação após falha: pare os consumidores; inicie somente o banco; restaure `database.dump` em uma base nova com `pg_restore --no-owner --no-privileges`; confira com o verificador; copie `blobs/` para `storage/blobs/` e restaure as configurações privadas; aponte as três URLs para a base recuperada; aplique as migrações para restaurar os privilégios; inicie um único gateway. Arquivos legados sem `blob_key` ficam em `legacy-media/<id>` no backup e exigem recompor `saved_audios.file_path`; a base migrada atual não tinha áudios legados. Ao mudar o diretório da instalação, ajuste também os caminhos absolutos dos áudios existentes.

A cópia SQLite anterior fica preservada em `codex-scripts/backups/`. **Depois de novas escritas no PostgreSQL, não volte diretamente ao snapshot SQLite:** ele também contém uma versão antiga da sessão. Prefira recuperação do PostgreSQL ou reconciliação explícita dos dados atuais.

## Recuperação de trabalhos

Mensagens novas são registradas antes da inicialização completa. A chave de entrada inclui conta, conversa, ID, participante e direção. Histórico e notificações com mais de cinco minutos não geram comandos. Há admissão por remetente, limite global de pendências e serialização por conversa.

Workers de mídia e inferência têm filas, limites de concorrência, prazo, cancelamento e tentativas finitas. Após queda de um worker, pg-boss recupera a tarefa. Cada tentativa de processamento recebe uma geração; uma tentativa antiga não publica sobre o resultado novo. Arquivos inválidos não viram MP3 de fachada. A biblioteca publica o áudio e a conclusão do trabalho na mesma transação.

O painel oferece progresso e cancelamento de uploads, além das últimas operações para administradores. Um efeito externo iniciado e sem resultado persistido fica **incerto** e não é reenviado automaticamente. A tela permite inspeção; ela não tenta decidir se uma moderação ou mensagem externa ocorreu. Confirme o resultado no WhatsApp antes de emitir uma nova ação manual.

A limpeza diária às 03h em America/Sao_Paulo remove mensagens de transporte vencidas (24h), confirmações antigas (7 dias), jobs terminais (7 dias), auditoria e operações terminais (30 dias). Operações incertas são preservadas para revisão. Blobs sem referência expiram em sete dias, em lotes de até mil por manutenção; um áudio salvo mantém seu arquivo. Temporários próprios são removidos ao concluir/falhar; a manutenção também recolhe diretórios de conversão, probe e download com mais de uma hora deixados por uma morte abrupta.

Erros genéricos de conexão, inclusive 405, preservam credenciais. A desconexão explícita pelo WhatsApp exige intervenção do proprietário; os antigos atalhos `--clear-session` não apagam o PostgreSQL. Não execute dois runtimes nem apague chaves para tentar corrigir uma falha transitória.

## Verificações de regressão

Os testes criam bases descartáveis, nunca usam produção como fixture:

```bash
ELYSIUM_SETUP_DATABASE_TEST=1 python3 scripts/qa-setup-local.py
bun scripts/qa-core-commands.ts
bun scripts/qa-voice-media.ts
bun scripts/test-semantic-intent.ts
bun scripts/qa-architecture.ts
bun scripts/qa-media-worker.ts
bun scripts/qa-failures.ts
bun scripts/qa-web.ts
```

O teste web requer build do painel. A comparação de interpretadores usa `bun scripts/qa-intent-parsers.ts` com os modelos locais ativos. OpenJev continua sendo a implementação adotada; o parser direto é experimental e não seleciona permissões nem executa comandos.
