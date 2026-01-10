#!/usr/bin/env bun
// Script de inicialização do bot com CLI colorida

import * as color from 'coloredcli/src/index.mjs';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Banner do bot
function showBanner() {
  console.log('');
  console.log(color.applyBackground(color.applyColor('                                      ', 'black'), 'bgCyan'));
  console.log(color.applyBackground(color.applyColor('   🤖  ELISYUM BOT - WhatsApp Bot   ', 'black'), 'bgCyan'));
  console.log(color.applyBackground(color.applyColor('                                      ', 'black'), 'bgCyan'));
  console.log('');
}

// Verificar se .env existe (apenas aviso, não bloqueia)
function checkEnv() {
  if (!existsSync('.env')) {
    console.log(color.applyColor('⚠️  Atenção: Arquivo .env não encontrado!', 'yellow'));
    console.log('');
  }
  return Promise.resolve(true);
}

// Iniciar o bot
async function startBot() {
  showBanner();
  
  await checkEnv();
  
  console.log(color.applyColor('✓ Iniciando bot...', 'green'));
  console.log('');
  console.log(color.applyColor('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue'));
  console.log('');
  
  // Executar o bot
  const { spawn } = require('child_process');
  const bot = spawn('bun', ['dist/app.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  bot.on('error', (error) => {
    console.log('');
    console.log(color.applyColor('❌ Erro ao iniciar o bot: ' + error.message, 'red'));
    console.log('');
    process.exit(1);
  });
  
  bot.on('close', (code) => {
    console.log('');
    if (code === 0) {
      console.log(color.applyColor('✓ Bot finalizado com sucesso', 'green'));
    } else {
      console.log(color.applyColor('❌ Bot finalizado com código: ' + code, 'red'));
    }
    console.log('');
    process.exit(code || 0);
  });
}

startBot().catch((error) => {
  console.log('');
  console.log(color.applyColor('❌ Erro fatal: ' + error.message, 'red'));
  console.log('');
  process.exit(1);
});
