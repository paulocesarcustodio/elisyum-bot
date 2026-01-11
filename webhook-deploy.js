#!/usr/bin/env bun
// Webhook server para deploy automático
import { createServer } from 'http';
import { exec } from 'child_process';
import { createHmac } from 'crypto';

const PORT = process.env.WEBHOOK_PORT || 3001;
const SECRET = process.env.WEBHOOK_SECRET || 'change-me-in-production';
const DEPLOY_PATH = process.env.DEPLOY_PATH || '/root/elisyum-bot';

console.log('🚀 Webhook Deploy Server');
console.log('=======================');
console.log(`Port: ${PORT}`);
console.log(`Path: ${DEPLOY_PATH}`);
console.log('Listening for GitHub webhooks...\n');

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    return res.end('Not Found');
  }

  let body = '';
  req.on('data', chunk => body += chunk.toString());
  
  req.on('end', () => {
    try {
      // Verifica signature do GitHub
      const signature = req.headers['x-hub-signature-256'];
      if (!signature) {
        console.error('❌ Missing signature');
        res.writeHead(401);
        return res.end('Unauthorized');
      }

      const hash = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
      if (signature !== hash) {
        console.error('❌ Invalid signature');
        res.writeHead(401);
        return res.end('Unauthorized');
      }

      const payload = JSON.parse(body);
      
      // Só executa deploy em push para main
      if (payload.ref !== 'refs/heads/main') {
        console.log(`ℹ️ Ignoring push to ${payload.ref}`);
        res.writeHead(200);
        return res.end('OK - Ignored');
      }

      console.log('🎯 Deploy triggered!');
      console.log(`   Commit: ${payload.head_commit.message}`);
      console.log(`   Author: ${payload.pusher.name}`);

      res.writeHead(200);
      res.end('OK - Deploying');

      // Executa deploy
      const deployScript = `
        cd ${DEPLOY_PATH}
        echo "🔄 Pulling changes..."
        git pull origin main
        echo "📦 Installing dependencies..."
        /root/.bun/bin/bun install --frozen-lockfile
        echo "🔨 Building..."
        /root/.bun/bin/bun run build
        echo "🔄 Restarting bot service..."
        systemctl restart lbot
        echo "✅ Deploy completed!"
      `;

      exec(deployScript, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Deploy failed:', error.message);
          return;
        }
        if (stderr) console.error('stderr:', stderr);
        console.log(stdout);
        console.log('✅ Deploy successful!\n');
      });

    } catch (err) {
      console.error('❌ Error:', err.message);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

}).listen(PORT, () => {
  console.log(`✅ Webhook server running on http://0.0.0.0:${PORT}/webhook`);
  console.log(`📝 Configure GitHub webhook to: http://YOUR_PUBLIC_IP:${PORT}/webhook\n`);
});
