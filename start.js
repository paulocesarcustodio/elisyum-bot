#!/usr/bin/env bun
// Script de inicialização do bot com CLI colorida

import * as color from 'coloredcli/src/index.mjs';
import { existsSync, readdirSync, rmSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const CLI_ARGS = process.argv.slice(2);
const KNOWN_FLAGS = new Set(['--clear-session', '--clear-session-only', '--help', '-h']);

function parseCliOptions(args) {
  return {
    showHelp: args.includes('--help') || args.includes('-h'),
    clearSession: args.includes('--clear-session'),
    clearSessionOnly: args.includes('--clear-session-only'),
    unknownArgs: args.filter((arg) => arg.startsWith('-') && !KNOWN_FLAGS.has(arg))
  };
}

function showHelp() {
  console.log(color.applyColor('Uso:', 'cyan'));
  console.log(color.applyColor('  bun start -- [opções]', 'yellow'));
  console.log('');
  console.log(color.applyColor('Opções:', 'cyan'));
  console.log(color.applyColor('  --clear-session       Limpa a sessão atual e inicia o bot para conectar outro número.', 'yellow'));
  console.log(color.applyColor('  --clear-session-only  Limpa a sessão atual e sai sem iniciar o bot.', 'yellow'));
  console.log(color.applyColor('  --help                Mostra esta ajuda.', 'yellow'));
  console.log('');
  console.log(color.applyColor('Atalhos:', 'cyan'));
  console.log(color.applyColor('  bun run start:fresh      Limpa a sessão e já inicia o bot.', 'yellow'));
  console.log(color.applyColor('  bun run session:clear    Limpa a sessão e encerra.', 'yellow'));
  console.log('');
}

function clearSessionFiles() {
  const storageDir = resolve(process.cwd(), 'storage');

  if (!existsSync(storageDir)) {
    return [];
  }

  const sessionFiles = readdirSync(storageDir).filter((fileName) => /^session\.db($|[.~].+)/.test(fileName));

  for (const fileName of sessionFiles) {
    rmSync(resolve(storageDir, fileName), { force: true });
  }

  return sessionFiles;
}

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
  const cliOptions = parseCliOptions(CLI_ARGS);

  showBanner();

  if (cliOptions.unknownArgs.length) {
    console.log(color.applyColor(`❌ Opções não reconhecidas: ${cliOptions.unknownArgs.join(', ')}`, 'red'));
    console.log('');
    showHelp();
    process.exit(1);
  }

  if (cliOptions.showHelp) {
    showHelp();
    return;
  }

  if (cliOptions.clearSession || cliOptions.clearSessionOnly) {
    const removedFiles = clearSessionFiles();

    if (removedFiles.length) {
      console.log(color.applyColor(`✓ Sessão removida com sucesso (${removedFiles.join(', ')})`, 'green'));
    } else {
      console.log(color.applyColor('⚠️  Nenhuma sessão existente foi encontrada em storage/session.db', 'yellow'));
    }

    console.log(color.applyColor('ℹ️  Seus áudios e bot.db foram preservados.', 'blue'));
    console.log('');

    if (cliOptions.clearSessionOnly) {
      console.log(color.applyColor('✓ Limpeza concluída. Inicie o bot quando quiser conectar outro número.', 'green'));
      console.log('');
      return;
    }
  }
  
  await checkEnv();
  
  console.log(color.applyColor('✓ Iniciando bot...', 'green'));
  console.log('');
  console.log(color.applyColor('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'blue'));
  console.log('');
  
  // Executar o bot
  const bot = spawn('bun', ['dist/app.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  let forwardedSignal = false;

  const forwardSignal = (signal) => {
    if (forwardedSignal || bot.killed) {
      return;
    }

    forwardedSignal = true;
    console.log(color.applyColor(`\n↪ Encaminhando ${signal} para o processo do bot...`, 'yellow'));
    bot.kill(signal);
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  
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
