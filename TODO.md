# TODO

- Acompanhar o issue upstream do Baileys sobre o fallback para `jimp` (tipo de export diferente) para eventualmente eliminar a exigência do `sharp` em ambientes limitados.
- Avaliar as vulnerabilidades apontadas pelo `npm audit` e planejar atualizações das dependências obsoletas.
- Definir fluxos ativos para newsletters (seguir, reagir, enviar mensagens) reutilizando os logs atuais como base para requisitos.
- Implementar expiração automática para membros silenciados após um período configurável, revertendo o mute sem intervenção manual.
- Verificar se outros pontos que atualizam contadores ou avisos de participantes deveriam recriar registros ausentes de forma semelhante ao `setAdmin`.
