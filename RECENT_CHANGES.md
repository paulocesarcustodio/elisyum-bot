# Recent Changes

- Padronizado o projeto no Yarn 4, ajustando scripts, resolução do libsignal e removendo o `package-lock.json` legado.
- Ajustados os imports do Baileys para usar o default `makeWASocket` e confirmada a compilação com a base ESM/TS.
- Implemented caching for blocked contacts with automatic invalidation after block/unblock operations.
- Atualizada a sincronização de grupos para aguardar a remoção completa antes de continuar.
- Processa cada mensagem recebida individualmente, reutilizando dados de grupo no lote para evitar consultas duplicadas.
- Added cached bot admin lookup with invalidation after admin role updates to reduce repeated database calls.
- Adicionada resposta guiando usuários para {$p}menu ou {$p}comando guia quando um comando desconhecido for digitado.
- Atualizadas as dependências (jimp 1.x, canvas 3.x e jsdom 26) para remover conflitos de instalação com Baileys e adaptado o utilitário de figurinhas para a nova API.
- Migrated to @whiskeysockets/baileys 7.0.0-rc.5 and enforced Node.js 20+ across tooling and documentation.
- Adicionada uma configuração mínima do webpack e dependências de CLI para que o `npx webpack` execute sem intervenção manual no CI.
- Protegido o estado NeDB com mutexes e desserialização via `proto.Message.AppStateSyncKeyData`, validado pelo teste `npx tsx tests/session.auth.helper.test.ts` para garantir persistência e limpeza das novas chaves de login.
- Ajustados eventos/formatadores para o Baileys 7 (participantes como objetos, requestId e contexto de download de mídia) e cobrimos os fluxos com novos testes de fila, mídia e formatação.
- Instaladas as dependências opcionais do Baileys (sharp, audio-decode, link-preview-js) com testes de mídia cobrindo miniaturas e waveform, além de documentação atualizada para setup e troubleshooting.
