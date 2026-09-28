#!/usr/bin/env bash
# Instalação/atualização local; também aceita execução via curl | bash.
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
    echo 'Instale Python 3.12 antes de executar o setup (Ubuntu 24.04: sudo apt-get install python3 python3-venv python3-pip).' >&2
    exit 1
fi

setup_root=''
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    setup_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$setup_script_dir/../setup-local.py" ]]; then
        setup_root="$(cd -- "$setup_script_dir/../.." && pwd)"
    fi
fi
if [[ -z "$setup_root" && -f scripts/setup-local.py ]]; then
    setup_root="$PWD"
fi
if [[ -z "$setup_root" ]]; then
    if ! command -v git >/dev/null 2>&1; then
        echo 'Instale Git para clonar o projeto.' >&2
        exit 1
    fi
    if [[ -e elisyum-bot ]]; then
        if [[ ! -f elisyum-bot/scripts/setup-local.py ]]; then
            echo 'A pasta elisyum-bot já existe e não contém o instalador atual. Atualize esse checkout ou escolha outra pasta.' >&2
            exit 1
        fi
    else
        git clone https://github.com/paulocesarcustodio/elisyum-bot.git elisyum-bot
    fi
    setup_root="$PWD/elisyum-bot"
fi
exec python3 "$setup_root/scripts/setup-local.py" "$@"
