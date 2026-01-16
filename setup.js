#!/usr/bin/env bun
// Script de instalação com CLI colorida

import * as color from 'coloredcli/src/index.mjs';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

// Banner
function showBanner() {
  console.log('');
  console.log(color.applyBackground(color.applyColor('                                        ', 'white'), 'bgBlue'));
  console.log(color.applyBackground(color.applyColor('   🚀  ELISYUM BOT - INSTALAÇÃO       ', 'white'), 'bgBlue'));
  console.log(color.applyBackground(color.applyColor('                                        ', 'white'), 'bgBlue'));
  console.log('');
}

// Funções de log
const log = {
  success: (msg) => console.log(color.applyColor('✓ ' + msg, 'green')),
  error: (msg) => console.log(color.applyColor('✗ ' + msg, 'red')),
  warning: (msg) => console.log(color.applyColor('⚠ ' + msg, 'yellow')),
  info: (msg) => console.log(color.applyColor('ℹ ' + msg, 'blue')),
  section: (msg) => {
    console.log('');
    console.log(color.applyColor(msg, 'cyan'));
    console.log(color.applyColor('━'.repeat(40), 'cyan'));
  }
};

// Verificar se comando existe
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Executar comando
function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, { 
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      ...options 
    });
  } catch (error) {
    if (!options.ignoreError) throw error;
    return null;
  }
}

// Instalação
async function install() {
  showBanner();
  
  // 1. Verificar Bun
  log.section('[1/5] Verificando Bun');
  if (commandExists('bun')) {
    const version = runCommand('bun --version', { silent: true })?.trim();
    log.success(`Bun já está instalado (v${version})`);
  } else {
    log.warning('Bun não encontrado. Instalando...');
    runCommand('curl -fsSL https://bun.sh/install | bash');
    log.success('Bun instalado com sucesso!');
  }
  
  // 2. Instalar dependências
  log.section('[2/5] Instalando dependências');
  if (!existsSync('package.json')) {
    log.error('package.json não encontrado!');
    process.exit(1);
  }
  runCommand('bun install');
  log.success('Dependências instaladas!');
  
  // 3. Criar diretórios
  log.section('[3/5] Criando estrutura de diretórios');
  const dirs = ['storage', 'storage/audios', 'session', 'temp', 'logs/session'];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      log.success(`Diretório criado: ${dir}`);
    } else {
      log.info(`Diretório já existe: ${dir}`);
    }
  }
  
  // 4. Criar .env
  log.section('[4/5] Configurando ambiente');
  if (!existsSync('.env')) {
    const envTemplate = `# Configurações do Bot
BOT_NAME="Elisyum Bot"
BOT_PREFIX="!"

# Administradores (separados por vírgula)
ADMIN_NUMBERS="5519XXXXXXXXX"

# Deepgram API (para transcrição de áudio)
DEEPGRAM_API_KEY=""

# Google AI API (para assistente de comandos com !ask)
GOOGLE_AI_API_KEY=""

# Debug
DEBUG=false
`;
    writeFileSync('.env', envTemplate);
    log.warning('.env criado! Configure suas variáveis antes de iniciar.');
  } else {
    log.success('.env já existe');
  }
  
  // 5. Build
  log.section('[5/5] Compilando TypeScript');
  runCommand('bun run build');
  log.success('Build concluído!');
  
  // Finalização
  console.log('');
  console.log(color.applyBackground(color.applyColor('                                        ', 'black'), 'bgGreen'));
  console.log(color.applyBackground(color.applyColor('   ✓  INSTALAÇÃO CONCLUÍDA!           ', 'black'), 'bgGreen'));
  console.log(color.applyBackground(color.applyColor('                                        ', 'black'), 'bgGreen'));
  console.log('');
  
  console.log(color.applyColor('Próximos passos:', 'cyan'));
  console.log('');
  console.log('1. Configure o .env:');
  console.log(color.applyColor('   nano .env', 'yellow'));
  console.log('');
  console.log('2. Inicie o bot:');
  console.log(color.applyColor('   bun start', 'yellow'));
  console.log(color.applyColor('   (ou use: ./run.sh)', 'brightBlack'));
  console.log('');
  console.log(color.applyColor('📚 Documentação: ', 'blue') + color.applyColor('docs/', 'cyan'));
  console.log('');
}

// Executar
install().catch((error) => {
  console.log('');
  console.log(color.applyColor('❌ Erro na instalação:', 'red'));
  console.log(color.applyColor(error.message, 'red'));
  console.log('');
  process.exit(1);
});
