# Setup dos modelos recomendados em CPU

## Perfil entregue

- Qwen3.5-4B Q4_K_M, revisão `e87f176479d0855a907a41277aca2f8ee7a09523` de `unsloth/Qwen3.5-4B-GGUF`.
- Whisper medium, revisão `08e178d48790749d25932bbc082711ddcfdfbc4f` de `Systran/faster-whisper-medium`, CPU int8.
- Manifesto compartilhado entre instalador e executor, downloads com SHA-256 e execução offline após instalação.
- Qwen: 4 threads, contexto 6144, um slot, raciocínio desativado e nenhuma camada na GPU. Whisper: 4 threads, um worker e uma transcrição simultânea.
- Prazos do cliente: classificação 60 segundos, transcrição 120 segundos. O adaptador do Qwen aguarda até 55 segundos. Esses valores são limites, não promessas de desempenho.

O container recomendado reserva 12 vCPU, 24 GiB de RAM, 2 GiB de swap e 100 GiB de SSD. O setup não modifica os recursos do Proxmox. Após `git pull`, executar `bash scripts/setup/install.sh --start` como usuário comum.

## Validação local

Executado em 27/09/2026, em máquina Ryzen local com 32 GiB de RAM, usando somente CPU. Não representa medição no EPYC de produção.

1. `ELYSIUM_SETUP_DATABASE_TEST=1 python3 scripts/qa-setup-local.py`: **10 testes passaram**, incluindo cluster descartável, migrações repetidas, preservação de dados/credenciais, falha de migração, checksum, correspondência dos modelos instalados com o runtime e recusa de arquivos incompletos.
2. Verificação de sintaxe Python e `git diff --check`: passaram.
3. Setup completo com `--start`: encerrou o runtime antes do build, reutilizou dependências/downloads verificados, aplicou migrações e compilou bot e painel com sucesso.
4. Nove processos ativos: supervisor, PostgreSQL, Qwen, Whisper, OpenJev, dois workers, painel e gateway WhatsApp. `/v1/models` confirmou o arquivo Qwen 4B Q4_K_M e contexto 6144; `/health` confirmou Whisper medium int8 em CPU.
5. Benchmark de classificação (`scripts/semantic-command.bench.ts`): **17/17 casos corretos**, mediana 945,8 ms e p95 15.541,3 ms. Inclui negações e relatos que devem retornar sem comando. O resultado vale para esse conjunto pequeno, não mede precisão geral.
6. Três amostras locais sintéticas de voz foram transcritas corretamente:

| Pedido | Duração do áudio | Tempo total da requisição |
| --- | ---: | ---: |
| Bot, mostra o menu de comandos. | 3,984 s | 5,44 s |
| Bot, transforma esta imagem em uma figurinha. | 4,824 s | 4,96 s |
| Bot, quais são as informações deste grupo? | 4,632 s | 5,28 s |

A classificação e a transcrição foram avaliadas sem enviar mensagens ou executar comandos no WhatsApp. Relatórios e logs locais ficam em `codex-scripts/recommended-models-*`, fora do Git. O relatório semântico inclui uma linha de inicialização antes do JSON; o resultado foi extraído e validado separadamente.
