# Progresso de downloads e Pinterest

## Correção

O worker gravava 5% ao iniciar, sem publicar os bytes baixados ou o tempo já convertido. O gateway consultava esse valor e disparava edições concorrentes da mesma mensagem. Agora:

- HTTP publica a proporção de bytes recebidos quando o tamanho total é conhecido.
- yt-dlp publica bytes pelo stdout/stderr, com tratamento de linhas divididas entre blocos.
- FFmpeg publica o tempo processado em relação à duração da mídia.
- O worker persiste progresso crescente, protege a tentativa atual e reserva 100% para a conclusão confirmada.
- O gateway aguarda os callbacks, elimina valores repetidos e serializa as edições no WhatsApp, com intervalo de um segundo.
- Downloads compartilhados propagam o progresso a todos os solicitantes.
- Sem tamanho conhecido, a mensagem continua indicando a etapa, sem inventar um percentual. O envio ao WhatsApp tem uma etapa própria.

## Pinterest

Pins públicos de vídeo e imagem são aceitos pelo auto-download e por `!d`; vídeos também podem alimentar `!mp3`. O detector aceita domínios nacionais do Pinterest e links curtos `pin.it`. Links curtos são resolvidos e precisam terminar em um Pin individual; pastas não são aceitas. Vídeos usam yt-dlp e imagens usam a maior imagem fornecida pelo extrator. São mantidos os limites de memória e fila; imagens HTTP continuam limitadas a 8 MB, e vídeos HTTP passam a aceitar até 48 MB, como os downloads por yt-dlp. O envio de vídeo mantém o limite de 20 MB e usa compressão quando necessário.

## Validação

`bun run tsc --noEmit` e `git diff --check` passaram. `scripts/qa-core-commands.ts`: 43 cenários, 34 handlers cobertos, incluindo envio de imagem/vídeo do Pinterest e reconhecimento automático em grupos e no privado.

`scripts/qa-download-progress.ts` passou com PostgreSQL temporário, worker separado e processos reais de yt-dlp/FFmpeg:

| Caso | Percentuais observados |
| --- | --- |
| HTTP com transferência lenta | 15, 30, 45, 60, 75, 90, 100 |
| HTTP sem tamanho informado | 100 apenas após terminar |
| Dois pedidos compartilhando yt-dlp | 14, 28, 58, 100 em ambos |
| Conversão FFmpeg | 26, 44, 54, 72, 90, 100 |
| Conexão interrompida | 5, 10; nunca 100 |

Também foram verificados callbacks sem sobreposição, ausência de regressão de percentual e bloqueio de atualizações de tentativas antigas/canceladas. As suítes `qa-failures.ts` e `qa-media-worker.ts` passaram após a alteração do worker.

`scripts/qa-download-networks.ts` baixou arquivos públicos reais pela fila e confirmou streams válidos com ffprobe:

| Rede | Amostra pública | Resultado |
| --- | --- | --- |
| YouTube | `jNQXAC9IVRw` | Vídeo de 629.172 bytes |
| Instagram | Reel `Chunk8-jurw` | Vídeo de 1.949.801 bytes |
| TikTok | Vídeo `6742501081818877190` | 2.027.898 bytes; 11%, 54%, 100% |
| X | Status `719944021058060289` | Vídeo de 537.709 bytes |
| Facebook | Vídeo CNN `10155529876156509` | Vídeo de 1.826.654 bytes |
| Pinterest | Pin `664281013778109217` | Vídeo de 3.236.862 bytes; 28 atualizações entre 4% e 100% |
| Pinterest | Pin `388224430372660239` | Imagem de 61.983 bytes |

As amostras pequenas de YouTube, Instagram, X, Facebook e imagem do Pinterest terminaram antes de o polling observar percentuais intermediários. A continuidade da barra foi verificada nas transferências lentas e no vídeo do Pinterest.

A primeira amostra de X (`665052190608723968`) não retornou vídeo no provedor. A primeira do Facebook (`637842556329505`) falhou na extração. Foram substituídas pelas amostras válidas acima; essas falhas continuam registradas em `codex-scripts/download-networks-qa.json`. Os retestes estão em `download-networks-qa-twitter.json` e `download-networks-qa-facebook.json` no mesmo diretório.

O link que falhou foi localizado no grupo de teste. O vídeo tinha 14.188.024 bytes (176 segundos), e os logs confirmaram que o limite genérico de 8 MB encerrava o download. Com a operação específica para vídeos, esse mesmo arquivo foi baixado e validado por ffprobe. O teste controlado também confirmou que 9 MB são aceitos para vídeo e rejeitados no caminho limitado de imagens. Falhas agora substituem a barra por uma mensagem de erro; a regressão verifica que um percentual atrasado não sobrescreve esse estado.

A resolução de `pin.it` está implementada, mas não foi exercitada com um link curto público neste ensaio.

## Conferência no WhatsApp após o deploy

Às 22h30–22h31 de 27/09/2026, no **Grupo de teste**, o mesmo link de X que antes falhava foi reenviado sem prefixo. A mensagem mostrou progresso na preparação (observados 2% e 77%), passou à compressão e terminou com “Concluído” e o vídeo entregue. Em seguida, o Pin público de vídeo `664281013778109217` também foi enviado sem prefixo e resultou em “Concluído” e no vídeo entregue.

O deploy final usou `scripts/local-runtime.py restart`: encerramento antes do build e início posterior dos processos. Supervisor, PostgreSQL, Qwen, Whisper, OpenJev, worker de mídia, worker de inferência, painel e bot foram verificados em execução. Não foram criados serviços do sistema.
