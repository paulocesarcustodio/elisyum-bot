# Elisyum Bot — Regras de Deploy

## Após alterar código do BOT (src/ ou quaisquer arquivos que afetem `dist/`)

Sempre que você fizer **alterações no código do bot** (nada de `node_modules`), você DEVE
executar, ao final do trabalho, o deploy completo na ordem correta:

```
bash /root/elisyum-bot/deploy.sh
```

Este script executa exatamente a sequência: **parar o serviço → build → reiniciar o serviço**.

Ele chama internamente:
- `systemctl stop lbot`
- build (`bun run build`)
- `systemctl start lbot`

## Regras importantes
- NUNCA use `systemctl restart lbot` sem antes buildar — o bot subiria com código velho/zipado.
- SEMPRE pare o serviço ANTES de buildar (evita o `dist/` sendo sobrescrito em uso e evita conflito no TypeScript watch).
- Espere o serviço ficar ativo após o reinício: verifique com `systemctl is-active lbot`.

## Exceções
- Alterações apenas estéticas de documentação (`.md`) NÃO precisam de deploy.
- Alterações em `web/` (frontend Next.js) usam `systemctl restart elisyum-web` (separado), NÃO o `deploy.sh`.