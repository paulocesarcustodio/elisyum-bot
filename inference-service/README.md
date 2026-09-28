# Classificação local pelo OpenJev

`openjev_local.py` registra um backend de classificação na API original do OpenJev.
O modelo Qwen3.5-2B Q4_K_M roda em um processo `llama-server` separado na CPU.
São processos comuns de terminal; não é necessário instalar serviços de sistema.

Configuração usada na validação:

- OpenJev 0.5.0, commit `a0ddd7d928298eccef2c17153b00b5636b6d996a` de `razorback16/openjev`.
- llama.cpp `b11222`, pacote portátil Linux x64 de `ggml-org/llama.cpp`.
- `unsloth/Qwen3.5-2B-GGUF`, arquivo `Qwen3.5-2B-Q4_K_M.gguf`, revisão `f6d5376be1edb4d416d56da11e5397a961aca8ae`.
- Endpoints locais: Whisper `8090`, OpenJev `8080`, llama.cpp `8081`.

Inicie o executor com contexto de 6144 tokens, um slot e raciocínio desativado:

```sh
llama-server -m /caminho/modelo.gguf --host 127.0.0.1 --port 8081 -c 6144 -np 1 -t 4 -tb 4 -ngl 0 --reasoning off
python inference-service/openjev_local.py
```

No ambiente do bot, configure `OPENJEV_MODEL=qwen3.5-2b-local`,
`OPENJEV_URL=http://127.0.0.1:8080`, `OPENJEV_TIMEOUT_MS=60000` e
`SEMANTIC_COMMANDS_ENABLED=true`. O primeiro pedido pode levar alguns segundos;
os seguintes reutilizam o prefixo do prompt em memória. O adapter aceita apenas
perguntas `choice`, suficientes para o roteamento de comandos.

A probabilidade dos tokens gerados ajuda a rejeitar decisões incertas. Ela **não**
é uma medida calibrada da precisão da intenção. Permissões, bloqueios, presença
de alvo/mídia e confirmação de ações que modificam dados continuam no bot.

Validação: `bun scripts/semantic-command.bench.ts`, com as variáveis acima.
Os resultados medem o conjunto específico de frases do teste; não garantem
reconhecimento perfeito de linguagem natural.
