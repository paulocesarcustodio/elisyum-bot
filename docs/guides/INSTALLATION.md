# Instalação do Elisyum Bot

O instalador atual usa PostgreSQL, modelos locais, bot e painel no terminal. O guia mantido está em [Instalação e atualização](../../INSTALL.md).

Depois de conferir os pré-requisitos desse guia, execute na raiz do projeto:

```bash
bash scripts/setup/install.sh --start
```

Use o mesmo comando após `git pull`. Para conferir os pré-requisitos sem modificar ou encerrar processos, use `--check`; para apenas preparar, omita `--start`.

O setup preserva configurações e dados existentes e não cria serviços do sistema. Instalações legadas SQLite exigem migração explícita; não apague o banco ou a sessão para tentar concluir o setup. Para logs, backup, restauração e inicialização diária, consulte [operação local](../operacao-local.md).
