#!/usr/bin/env bash
# Alias mantido para quem já usa o antigo setup/deploy.
set -euo pipefail
setup_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$setup_script_dir/install.sh" "$@"
