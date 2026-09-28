# Implantação da arquitetura

Plano autorizado executado para os **34 comandos preservados**, com operação local pelo terminal. A base ativa é PostgreSQL; o SQLite anterior permanece como snapshot. O painel e o bot compartilham o esquema Drizzle. A referência operacional está em [operacao-local.md](operacao-local.md).

## Entregas e evidências

| Etapa | Entrega | Verificação |
|---|---|---|
| 1. Referência e recuperação | Catálogo final, fixtures, lockfiles e versões fixadas | 40 cenários cobrindo 34 handlers; snapshot SQLite íntegro e restauração em cópia. |
| 2. Contratos e execução | Catálogo comum, executor de política, identidades LID/PN, gateway exclusivo e cache | Todas as entradas passam por permissões; revalidação da confirmação; deduplicação e mensagens durante inicialização; agendamento único. |
| 3. Baileys | rc14 fixado; versão de protocolo incluída; `getMessage`, metadados e mapeamento LID | Round-trip de categorias de autenticação, erro 405 sem apagar sessão e gateway único; duas inicializações reais com a mesma sessão; voz, mídia e citação no Grupo de teste. |
| 4. PostgreSQL / Drizzle | Esquema canônico, migrações, importador e papéis separados | Ensaio em cópia e corte real: **9.748 registros / 8 tabelas**, conteúdo e contagens iguais; **7.925 registros de autenticação** preservados. |
| 5. Operações persistentes | Inbox/outbox, confirmações, pg-boss, cancelamento e expiração | 8 grupos de testes de arquitetura; queda antes/depois de efeitos; saída incerta sem reenvio automático; uma confirmação por uso. |
| 6. Mídia / painel | Workers separados, subprocessos limitados, BlobStore, biblioteca comum e upload com job | 4 grupos de testes de worker e 5 de falhas; upload HTTP 202 em **29 ms**; mídia inválida rejeitada; permissões e arquivos compartilhados verificados. |
| 7. Inferência | Implementações OpenJev e JSON direto comparadas | OpenJev mantido; parser direto falha em argumentos e latência. [Avaliação detalhada](avaliacao-inferencia.md). |
| 8. Operação | Executor, métricas, logs com rotação, retenção e backup verificável | Build de bot/painel; restauração PostgreSQL em base vazia com **38 tabelas idênticas** e **33 arquivos verificados**; APIs locais saudáveis; testes de falhas reproduzidos. |

## Corte e recuperação

O bot antigo foi encerrado antes do snapshot final e da atualização de dependências. O importador recusaria uma base de destino já preenchida e verificou conteúdo normalizado, relações e serialização. Não houve escrita simultânea da aplicação nos dois bancos nem duas conexões WhatsApp.

Os backups anteriores, o snapshot de corte e o primeiro backup PostgreSQL ficam em `codex-scripts/backups/`, com acesso privado. O verificador restaura somente em base temporária e compara hashes; configurações e mídias também entram no manifesto. Após a ativação e novas escritas, a recuperação deve partir do PostgreSQL, evitando restaurar chaves antigas do SQLite.

## Testes e alcance

- **Comandos:** 40 cenários, todos os 34 handlers cobertos com transporte simulado; inclui os comandos administrativos e efeitos que não devem ser exercitados em grupos reais.
- **Voz:** 14 rotas positivas e 20 casos sem palavra de ativação, bloqueios e ausência de fonte; regressões de interpretação e mídia respondida.
- **Arquitetura:** entrada duplicada, inicialização, mudança de permissão, LID, confirmação expirada/cancelada, isolamento de credenciais, geração do gateway e resultado externo incerto.
- **Workers e falhas:** processo morto após aceitar tarefa, cancelamento, arquivo inválido, nome duplicado, concorrência upload/limpeza, disco sem espaço, fila cheia, tentativa substituída, limite de saída, Whisper indisponível e modelo lento.
- **Painel:** login real em contas fictícias de base descartável, sessão anônima, usuário comum e administrador; tentativa de elevar permissão recusada; dono de job/áudio respeitado; upload, renomeação, reprodução e falha inspecionáveis. Navegador conferido sem erros de console.
- **WhatsApp real:** validações limitadas ao Grupo de teste previamente autorizado. O menu reconheceu o dono após a migração e foi respondido por texto e voz; um vídeo sintético de dois segundos foi convertido e devolvido em MP3 com a citação correta. Após o segundo início, um pedido de menu em linguagem natural voltou a funcionar. Uma única conexão de propriedade do gateway permaneceu ativa.

Os logs detalhados das execuções estão em `codex-scripts/architecture-*.log`; os comandos reproduzíveis estão no guia operacional. As contagens de falhas operacionais incluem rejeições esperadas de entrada, como lista negra vazia e tentativa de converter áudio usando um comando que exige vídeo.

## Limites explícitos

Esta implantação suporta uma conta WhatsApp. Cadastros legados globais foram preservados para migração sem perda; multi-conta exigiria completar seu particionamento. O transporte encapsula os handlers existentes, mantendo a evolução gradual do monólito. Parte dos logs das bibliotecas ainda é textual.

A entrega não promete efeito externo exatamente uma vez: após queda no intervalo entre envio e gravação, o resultado é marcado como incerto e requer revisão. A administração local não tem botão de reenvio automático para esses casos.

O parser JSON direto permanece experimental. O painel não permite cadastro aberto e a instalação original não possuía usuários web; o primeiro acesso administrativo depende da identidade escolhida pelo proprietário, sem criação de conta arbitrária.

## Estado final observado

Execução aberta em terminal comum, com oito processos filhos e PostgreSQL como único banco de escrita. As quatro verificações HTTP locais retornaram 200. Os papéis do painel e dos workers receberam `permission denied` ao consultar as chaves WhatsApp, como esperado. O segundo início elevou a geração da conexão para 2 e preservou a sessão, sem novo pareamento.

O primeiro pedido natural após recarregar o modelo levou cerca de 4,4 s no worker; isso é uma medição de partida fria, distinta da comparação de inferência já aquecida. Os números não são uma promessa de latência constante.
