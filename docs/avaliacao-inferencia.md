# Avaliação do interpretador direto

Decisão: **manter OpenJev no caminho ativo**. A implementação `LlamaJsonIntentParser` fica disponível para experimentos, sem ser selecionada pelo gateway.

Comparação de 26 pedidos em português, congelados em `scripts/fixtures/intent-heldout.json` antes da execução. Ambos usaram Qwen3.5-2B Q4_K_M, llama.cpp b11222, CPU e o mesmo catálogo elegível. O adaptador OpenJev inclui a extração de argumentos/alvo já usada pelo bot. O parser direto recebeu esquema JSON restringindo comandos e estrutura; nenhuma saída executa ações por si só.

| Medida | OpenJev | JSON direto |
|---|---:|---:|
| Comando correto | 20/26 | 23/26 |
| Comando + argumentos + alvo corretos | 13/26 | 17/26 |
| Mediana | 384 ms | 1.667 ms |
| p95 | 470 ms | 2.143 ms |

Os resultados não justificam substituir a implementação ativa: o parser direto falhou na equivalência de argumentos e excedeu o limite de 1,5 vez a latência de referência. Acertar o nome do comando não basta para uma moderação ou transformação de mídia. As métricas acima medem os adaptadores de interpretação; o caminho completo do bot também tem regras determinísticas, resolução de contexto, autorização e confirmação.

O corpus revelou um relato passado que merecia proteção explícita (“ontem pediram para silenciar…”). Depois da comparação, a proteção geral contra relatos foi ampliada e ganhou regressão própria. O resultado congelado em [qa/intent-parser-comparison.json](qa/intent-parser-comparison.json) é anterior a essa correção; reutilizações futuras desse corpus serão regressão, não uma nova avaliação cega. Não houve ajuste de prompt para elevar a pontuação publicada.

Os testes de voz e permissões do caminho ativo passaram separadamente. Uma futura substituição deve usar outro conjunto reservado e cobrir ambiguidades, alvo, mídia respondida, negação, latência e recursos. Os escores de classificação não são apresentados ao usuário como probabilidade de intenção correta.
