#!/bin/bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
cd "$(dirname "$0")/web"
exec bun next start -p 3000