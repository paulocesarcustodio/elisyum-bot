#!/usr/bin/env python3
"""Instala ou atualiza o runtime local completo, sem criar serviços do sistema."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import time
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / 'codex-scripts'
MANIFEST = json.loads((ROOT / 'scripts/runtime-manifest.json').read_text())
SYSTEM_PACKAGES = ('git python3 python3-venv python3-pip python3-dev build-essential '
                   'pkg-config bison flex libicu-dev zlib1g-dev libssl-dev ffmpeg '
                   'libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev')


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


pg = module('postgres_setup', 'setup-postgres.py')
database = module('local_database', 'local-database.py')
runtime = module('local_runtime', 'local-runtime.py')


def preflight():
    """Read-only checks run before stopping an existing installation."""
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
        raise RuntimeError('Este instalador suporta Linux x86-64; ambiente validado: Ubuntu 24.04. No Windows, use WSL2 com Ubuntu 24.04.')
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError('Use Python 3.12 para as dependências fixadas desta instalação.')
    if os.geteuid() == 0:
        raise RuntimeError('Execute como usuário comum: o PostgreSQL não roda como root. Instale apenas os pré-requisitos do sistema com sudo.')
    missing = [name for name in ('git', 'ffmpeg', 'ffprobe', 'gcc', 'g++', 'make', 'pkg-config') if not shutil.which(name)]
    if not importlib.util.find_spec('ensurepip') and not importlib.util.find_spec('pip'):
        missing.append('python3-venv/python3-pip')
    if not (shutil.which('bison') and shutil.which('flex')) and not shutil.which('dpkg-deb'):
        missing.append('bison e flex (ou dpkg-deb no Ubuntu 24.04)')
    if shutil.which('pkg-config'):
        for name in ('icu-uc', 'zlib', 'cairo', 'pangocairo', 'libjpeg'):
            if subprocess.run(['pkg-config', '--exists', name]).returncode:
                missing.append(name + ' (desenvolvimento)')
    if missing:
        raise RuntimeError('Pré-requisitos ausentes: ' + ', '.join(missing) + '\nNo Ubuntu 24.04, execute:\nsudo apt-get update\nsudo apt-get install -y ' + SYSTEM_PACKAGES)
    for name in ('bun.lock', 'web/bun.lock', 'whisper-service/requirements.lock.txt'):
        if not (ROOT / name).is_file():
            raise RuntimeError('Arquivo obrigatório ausente: ' + name + '. Atualize o checkout completo.')
    cluster = ROOT / 'storage/postgresql/PG_VERSION'
    if cluster.exists():
        if cluster.read_text().strip() != MANIFEST['postgres'].split('.')[0]:
            raise RuntimeError('A versão principal do cluster PostgreSQL exige migração própria; o instalador não substituirá os dados.')
        if not (LOCAL / 'database.env').exists():
            raise RuntimeError('Cluster existente sem database.env: restaure as credenciais do backup antes de continuar.')
    elif (ROOT / 'storage/bot.db').exists():
        raise RuntimeError('Instalação SQLite detectada. Migre um snapshot verificado conforme docs/operacao-local.md antes de iniciar o PostgreSQL. O banco original foi preservado.')
    print('Pré-requisitos conferidos. Bun, PostgreSQL, modelos e pacotes serão preparados dentro do projeto.', flush=True)


def install_bun():
    destination = LOCAL / 'bun/bin/bun'
    if destination.exists() and subprocess.check_output([str(destination), '--version'], text=True).strip() == MANIFEST['bun']:
        return str(destination)
    item = MANIFEST['bunArchive']
    archive = LOCAL / ('downloads/bun-' + MANIFEST['bun'] + '.zip')
    print('Preparando Bun ' + MANIFEST['bun'] + ' local...', flush=True)
    pg.download(item['url'], archive, item['sha256'])
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.new')
    try:
        with zipfile.ZipFile(archive) as bundle, bundle.open(item['member']) as source, temporary.open('wb') as output:
            shutil.copyfileobj(source, output)
        temporary.chmod(0o755)
        if subprocess.check_output([str(temporary), '--version'], text=True).strip() != MANIFEST['bun']:
            raise RuntimeError('Versão inesperada do Bun baixado.')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return str(destination)


def install_dependencies(bun):
    print('Instalando PostgreSQL e dependências fixadas...', flush=True)
    pg.main()
    for folder in (ROOT, ROOT / 'web'):
        subprocess.run([bun, 'install', '--frozen-lockfile'], cwd=folder, check=True)
    venv = ROOT / 'whisper-service/.venv'
    python = str(venv / 'bin/python')
    if not Path(python).exists():
        if subprocess.run([sys.executable, '-m', 'venv', str(venv)]).returncode:
            subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(venv)], check=True)
    if subprocess.run([python, '-m', 'pip', '--version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        subprocess.run([sys.executable, '-m', 'pip', '--python', python, 'install', 'pip==26.2.1'], check=True)
    requirements = ROOT / 'whisper-service/requirements.lock.txt'
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = venv / '.requirements.sha256'
    if not stamp.exists() or stamp.read_text().strip() != digest:
        subprocess.run([python, '-m', 'pip', 'install', '-r', str(requirements)], check=True)
        subprocess.run([python, '-m', 'pip', 'check'], check=True)
        stamp.write_text(digest + '\n')
    else:
        subprocess.run([python, '-m', 'pip', 'check'], check=True)
    print('Conferindo binários e modelos (downloads somente quando necessários)...', flush=True)
    archive = LOCAL / 'llama/llama-b11222-bin-ubuntu-x64.tar.gz'
    pg.download('https://github.com/ggml-org/llama.cpp/releases/download/b11222/' + archive.name, archive,
                'cfd2323f9ffec9657ca247140129be68df62d98f30a8448b20b1ca7a1796e1cb')
    if not runtime.LLAMA.exists():
        with tarfile.open(archive) as bundle:
            bundle.extractall(archive.parent, filter='data')
    install_models()
    ytdlp = ROOT / 'bin/yt-dlp'
    pg.download(MANIFEST['ytDlp']['url'], ytdlp, MANIFEST['ytDlp']['sha256'])
    ytdlp.chmod(0o755)


def install_models():
    for name, model in MANIFEST['models'].items():
        print(f"Preparando {model['repository']} ({model['revision'][:12]})...", flush=True)
        for item in model['files']:
            destination = runtime.model_directory(name) / item['name']
            url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{item['name']}"
            pg.download(url, destination, item['sha256'])


def prepare_configuration():
    for name in ('storage/audios', 'storage/blobs', 'temp', 'logs/session'):
        (ROOT / name).mkdir(parents=True, exist_ok=True)
    for file, content in (
        (ROOT / '.env', '# Configuração opcional do bot; credenciais locais ficam em codex-scripts/.\nDEBUG=false\n'),
        (LOCAL / 'web.env', 'BETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=' + secrets.token_hex(48) + '\n'),
    ):
        if not file.exists():
            file.write_text(content)
            file.chmod(0o600)
    database.prepare()


@contextmanager
def temporary_database():
    """Own and stop exactly the PostgreSQL process launched for bootstrap/migrations."""
    port = int(database.read_environment()['PG_PORT'])
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Porta {port} ocupada. O instalador não usará nem encerrará um banco de outro processo.')
    with (LOCAL / 'postgres-setup.log').open('a') as log:
        child = subprocess.Popen([str(database.BIN / 'postgres'), '-D', str(database.DATA)],
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 30
            while True:
                if child.poll() is not None:
                    raise RuntimeError('PostgreSQL encerrou durante o setup; consulte codex-scripts/postgres-setup.log.')
                if subprocess.run([str(database.BIN / 'pg_isready'), '-h', '127.0.0.1', '-p', str(port)],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError('PostgreSQL não ficou pronto em 30 segundos.')
                time.sleep(.25)
            yield
        finally:
            if child.poll() is None:
                child.send_signal(signal.SIGINT)
                try:
                    child.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
                    raise RuntimeError('PostgreSQL excedeu o prazo de encerramento; consulte o log antes de iniciar o runtime.')


def install():
    preflight()
    LOCAL.mkdir(exist_ok=True)
    # Serialize installers before stopping anything; runtime/build share the second lock.
    with (LOCAL / 'setup.lock').open('a') as setup_lock:
        try:
            fcntl.flock(setup_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Outro instalador já está em execução.')
        runtime.stop()
        with (LOCAL / 'local-runtime.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('Outro runtime ou build está em execução.')
            bun = install_bun()
            runtime.BUN = bun
            os.environ['PATH'] = str(Path(bun).parent) + os.pathsep + os.environ.get('PATH', '')
            install_dependencies(bun)
            prepare_configuration()
            print('Preparando banco, permissões e migrações...', flush=True)
            with temporary_database():
                database.bootstrap()
                subprocess.run([bun, 'scripts/migrate-postgres.ts', 'elysium'], cwd=ROOT, check=True)
            print('Compilando bot e painel...', flush=True)
            runtime.build(install=False)
    print('Setup concluído. Banco, configurações e sessão existentes foram preservados.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument('--check', action='store_true', help='confere pré-requisitos sem instalar ou parar processos')
    options.add_argument('--start', action='store_true', help='inicia o runtime no terminal após concluir o setup')
    args = parser.parse_args()
    if args.check:
        preflight()
        return
    os.umask(0o077)
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    install()
    if args.start:
        os.execv(sys.executable, [sys.executable, str(ROOT / 'scripts/local-runtime.py'), 'start'])
    print('Para iniciar: python3 scripts/local-runtime.py start')
    print('Na primeira conexão, faça o pareamento do WhatsApp. O primeiro usuário do painel deve ser definido pelo proprietário.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nSetup interrompido.', file=sys.stderr)
        sys.exit(130)
    except (RuntimeError, OSError, subprocess.CalledProcessError, zipfile.BadZipFile, tarfile.TarError) as error:
        print('Erro no setup:', error, file=sys.stderr)
        sys.exit(1)
