# Qwen 2B e Whisper large-v3-turbo em CPU

O perfil substitui Qwen 4B + Whisper medium por Qwen3.5-2B Q4_K_M (4 threads) e faster-whisper large-v3-turbo int8 (6 threads), conforme solicitado. Mantém uma transcrição por vez, português fixo, `beam_size=3`, limite de áudio de 15 segundos e os prazos máximos anteriores.

O manifesto fixa Qwen na revisão `f6d5376be1edb4d416d56da11e5397a961aca8ae` de `unsloth/Qwen3.5-2B-GGUF`; o Turbo usa `mobiuslabsgmbh/faster-whisper-large-v3-turbo` na revisão `0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf`. Este é o repositório associado ao nome `large-v3-turbo` pela versão instalada de faster-whisper. Pesos, tokenizer, vocabulário e pré-processamento são baixados com SHA-256 verificado. Os seis arquivos dos dois modelos somam 2.902.501.823 bytes.

## Testes

- `ELYSIUM_SETUP_DATABASE_TEST=1 python3 scripts/qa-setup-local.py`: 10 testes passaram, incluindo banco descartável, preservação de dados/credenciais e correspondência dos arquivos baixados com os caminhos do executor. A regressão agora verifica também o pré-processamento e vocabulário do Turbo, 6 threads e o nome Qwen 2B.
- Download real pelo instalador e `runtime.check_versions()`: passaram.
- Sintaxe Python e `git diff --check`: passaram.
- Transcrição executada pela aplicação FastAPI, via transporte ASGI em processo, com lifespan e modelo reais, sem iniciar o bot. Três amostras sintéticas:

| Áudio | Resultado | Tempo da requisição |
| --- | --- | ---: |
| Menu | Bot, mostra o menu de comandos. | 6,312 s |
| Figurinha | Bot, transforma esta imagem em uma figurinha. | 6,094 s |
| Grupo | Bot, quais são as informações deste grupo? | 6,127 s |

- Qwen e OpenJev iniciados temporariamente em portas separadas. O primeiro ensaio acertou 16/17 casos e confundiu “pega só o áudio” com reprodução de áudio salvo. As instruções foram esclarecidas: `audio` exige reprodução de som salvo pelo nome; extrair/obter apenas o áudio corresponde a `mp3`.
- Repetição do conjunto de 17 frases após o ajuste: 17/17 corretas; mediana 357,84 ms, p95 4.860,69 ms. Como as instruções foram ajustadas após observar o erro, este é um teste de regressão, não uma avaliação independente de precisão.

No ensaio anterior com Qwen 4B a mediana foi 945,8 ms e p95 15.541,3 ms. O Whisper medium anterior transcreveu essas mesmas amostras em cerca de 5 segundos: **o Turbo não demonstrou ganho de velocidade de transcrição neste teste local**. Os ensaios ocorreram em momentos e condições diferentes; não são benchmark controlado nem resultado do EPYC de produção. A qualidade precisa ser comparada com áudios reais que falharam.

Os processos temporários foram encerrados; o runtime principal permanece desligado. Logs e resultados ficam em `codex-scripts/turbo-*`, fora do Git. Nenhuma mensagem foi enviada ao WhatsApp.

## Aplicação no servidor

Como usuário comum, após atualizar o checkout:

```bash
git pull --ff-only
bash scripts/setup/install.sh --start
```

O setup instala os modelos definidos no manifesto, compila e inicia o runtime. O pull isolado não aplica a configuração a processos já em execução. Os pesos anteriores são preservados no cache.
