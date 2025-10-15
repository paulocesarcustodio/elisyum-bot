# Recent Changes

- Atualizada a sincronização de grupos para aguardar a remoção completa antes de continuar.
- Processa cada mensagem recebida individualmente, reutilizando dados de grupo no lote para evitar consultas duplicadas.
- Added cached bot admin lookup with invalidation after admin role updates to reduce repeated database calls.
- Adicionada resposta guiando usuários para {$p}menu ou {$p}comando guia quando um comando desconhecido for digitado.