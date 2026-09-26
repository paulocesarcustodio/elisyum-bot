#!/bin/bash
set -e

BUN='/root/.bun/bin/bun'

echo "🛑 Parando serviço lbot..."
systemctl stop lbot || true

echo "📦 Instalando dependências..."
"$BUN" install --frozen-lockfile

echo "🔨 Buildando..."
"$BUN" run build

echo "✅ Build concluído!"

echo "▶️ Reiniciando serviço lbot..."
systemctl start lbot

echo "✅ Deploy concluído!"
systemctl status lbot --no-pager | head -n 10