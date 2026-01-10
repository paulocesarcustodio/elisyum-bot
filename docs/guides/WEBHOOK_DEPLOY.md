# Webhook Deploy - Configuração

## 🚀 Setup no LXC

### 1. Gere um secret seguro
```bash
openssl rand -hex 32
# Copie o resultado
```

### 2. Configure variáveis de ambiente
```bash
export WEBHOOK_SECRET="seu-secret-gerado-acima"
export WEBHOOK_PORT=3001
export DEPLOY_PATH="/root/elisyum-bot"
```

### 3. Inicie o servidor webhook
```bash
cd /root/elisyum-bot
bun webhook-deploy.js &
```

**Ou com PM2 (recomendado):**
```bash
pm2 start webhook-deploy.js --name webhook-deploy
pm2 save
pm2 startup
```

### 4. Exponha a porta (se necessário)
```bash
# Se usar firewall
ufw allow 3001/tcp

# Se LXC, configure port forward no host
```

---

## 🔧 Configuração no GitHub

### 1. Acesse Webhook Settings
`https://github.com/victorsouzaleal/lbot-whatsapp/settings/hooks`

### 2. Clique em "Add webhook"

### 3. Configure:
- **Payload URL:** `http://SEU_IP_PUBLICO:3001/webhook`
- **Content type:** `application/json`
- **Secret:** Cole o secret que você gerou
- **Which events:** Selecione "Just the push event"
- **Active:** ✅ Marcado

### 4. Salve

---

## ✅ Testando

Faça um commit qualquer:
```bash
echo "# Test" >> README.md
git add README.md
git commit -m "test: webhook deploy"
git push origin main
```

Verifique os logs:
```bash
# No LXC
pm2 logs webhook-deploy
# ou
tail -f bot.log
```

---

## 🔐 Segurança

- ✅ Sempre use HTTPS em produção (configure nginx/caddy)
- ✅ Use secret forte
- ✅ Limite acesso à porta 3001 apenas para IPs do GitHub
- ✅ Considere usar Cloudflare Tunnel para não expor porta

---

## 📊 Status

Para verificar se está rodando:
```bash
pm2 status
curl http://localhost:3001/webhook  # Deve retornar 404 (correto)
```
