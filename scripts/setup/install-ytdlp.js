// Script para baixar o binário yt-dlp usando curl/wget
import { execSync } from 'child_process';
import { platform } from 'os';
import { chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');
const binDir = join(projectRoot, 'bin');

const isWindows = platform() === 'win32';
const fileName = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const ytDlpPath = join(binDir, fileName);

if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
}

if (existsSync(ytDlpPath)) {
    console.log('✓ yt-dlp já está instalado em:', ytDlpPath);
    process.exit(0);
}

console.log('Baixando yt-dlp...');

const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;

try {
    execSync(`curl -L "${downloadUrl}" -o "${ytDlpPath}"`, { stdio: 'inherit' });
    if (!isWindows) {
        chmodSync(ytDlpPath, '755');
    }
    console.log('✓ yt-dlp baixado com sucesso em:', ytDlpPath);
} catch (err) {
    console.error('Erro ao baixar yt-dlp:', err.message);
    process.exit(1);
}
