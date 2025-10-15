# TODO

- Consider moving the blocked contacts cache into a dedicated helper to eliminate the dynamic import used for invalidation.
- Acompanhar o issue upstream do Baileys sobre o fallback para `jimp` (tipo de export diferente) para eventualmente eliminar a exigência do `sharp` em ambientes limitados.
- Avaliar as vulnerabilidades apontadas pelo `npm audit` e planejar atualizações das dependências obsoletas.
- Mapear os novos eventos de newsletter do Baileys 7 para handlers (ou logs) específicos antes de habilitar fluxos de interação com canais.
