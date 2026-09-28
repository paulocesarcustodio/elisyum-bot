#!/usr/bin/env python3
"""Runtime local: PostgreSQL, modelos, workers, painel e um gateway; sem serviços do sistema."""
import argparse
import fcntl
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parent.parent
LOCAL=ROOT/'codex-scripts'
CACHE=LOCAL/'cache/huggingface'
PYTHON=ROOT/'whisper-service/.venv/bin/python'
STATE=LOCAL/'local-runtime.json'
PG=LOCAL/'postgres/bin'
MANIFEST=json.loads((ROOT/'scripts/runtime-manifest.json').read_text())
MODELS=MANIFEST['models']

def model_directory(name):
    model=MODELS[name]
    return CACHE/'hub'/('models--'+model['repository'].replace('/','--'))/'snapshots'/model['revision']

MODEL=model_directory('qwen')/MODELS['qwen']['files'][0]['name']
LLAMA=LOCAL/'llama/llama-b11222/llama-server'
BUN=str(LOCAL/'bun/bin/bun') if (LOCAL/'bun/bin/bun').exists() else (shutil.which('bun') or str(Path.home()/'.bun/bin/bun'))

def read_env(file):
    if not file.exists():raise RuntimeError(f'Configuração ausente: {file}; consulte docs/operacao-local.md')
    return dict(line.split('=',1) for line in file.read_text().splitlines() if line and not line.startswith('#'))

def environment():
    return {
        **os.environ,
        "PATH": str(Path(BUN).parent)+os.pathsep+os.environ.get('PATH',''),
        "HF_HOME": str(CACHE),
        "HF_HUB_CACHE": str(CACHE / "hub"),
        "HF_HUB_DISABLE_XET": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": str(MODELS['whisper']['cpuThreads']),
        "MKL_NUM_THREADS": str(MODELS['whisper']['cpuThreads']),
        "TOKENIZERS_PARALLELISM": "false",
        "WHISPER_MODEL": str(model_directory('whisper')),
        "WHISPER_DEVICE": "cpu",
        "WHISPER_COMPUTE_TYPE": MODELS['whisper']['computeType'],
        "WHISPER_CPU_THREADS": str(MODELS['whisper']['cpuThreads']),
        "WHISPER_INTRA_THREADS": "1",
        "WHISPER_MAX_CONCURRENT": str(MODELS['whisper']['maxConcurrent']),
        "WHISPER_TIMEOUT_MS": str(MODELS['whisper']['timeoutMs']),
        "OPENJEV_BACKEND": "qwen-local",
        "OPENJEV_WARMUP": "0",
        "OPENJEV_DEVICE": "cpu",
        "OPENJEV_HOST": "127.0.0.1",
        "OPENJEV_PORT": "8080",
        "OPENJEV_URL": "http://127.0.0.1:8080",
        "OPENJEV_MODEL": MODELS['qwen']['modelName'],
        "OPENJEV_LLAMA_URL": "http://127.0.0.1:8081",
        "OPENJEV_TIMEOUT_MS": str(MODELS['qwen']['timeoutMs']),
        "OPENJEV_LLAMA_TIMEOUT_SECONDS": str(MODELS['qwen']['timeoutMs']/1000-5),
        "OPENJEV_ROUTING_MODE": "auto",
        "WHISPER_URL": "http://127.0.0.1:8090",
        "WHISPER_LANGUAGE": "pt",
        "VOICE_COMMANDS_ENABLED": "true",
        "SEMANTIC_COMMANDS_ENABLED": "true",
    }


def live_state():
    if not STATE.exists():return None
    state=json.loads(STATE.read_text())
    try:
        args=(Path('/proc')/str(state['supervisor'])/'cmdline').read_bytes().split(b'\0')
        if not any(arg.endswith(b'/local-runtime.py') or arg.endswith(b'/run-local.py') for arg in args):return None
        return state
    except (OSError,KeyError):return None

def stop():
    state=live_state()
    if not state:print('Execução local já está parada.');return
    os.kill(state['supervisor'],signal.SIGTERM)
    deadline=time.monotonic()+100
    while live_state() and time.monotonic()<deadline:time.sleep(.2)
    if live_state():raise RuntimeError('O encerramento ainda não terminou. Nenhum processo foi forçado; consulte os logs.')
    print('Execução local encerrada.')

def check_versions():
    if subprocess.check_output([BUN,'--version'],text=True).strip()!='1.4.0':raise RuntimeError('Esta implantação requer Bun 1.4.0.')
    if not (PG/'postgres').exists():raise RuntimeError('Execute python3 scripts/setup-postgres.py.')
    if not PYTHON.exists() or not MODEL.exists() or not LLAMA.exists():raise RuntimeError('Execute python3 scripts/setup-local.py para preparar as dependências locais.')
    for name,model in MODELS.items():
        for item in model['files']:
            path=model_directory(name)/item['name']
            if not path.is_file() or path.stat().st_size!=item['size']:
                raise RuntimeError(f'Modelo {name} ausente ou incompleto. Execute python3 scripts/setup-local.py.')

def qwen_command():
    model=MODELS['qwen']
    return [str(LLAMA),'-m',str(MODEL),'--host','127.0.0.1','--port','8081',
            '-c',str(model['contextSize']),'-np','1','-t',str(model['threads']),
            '-tb',str(model['threads']),'-ngl','0','--reasoning','off']

def build(install=True):
    # Caller holds the same lock used throughout the runtime lifetime.
    if live_state():raise RuntimeError('Pare o runtime antes de compilar.')
    check_versions()
    env={**environment(),**read_env(LOCAL/'web.env'),'NEXT_TELEMETRY_DISABLED':'1'}
    if install:
        subprocess.run([BUN,'install','--frozen-lockfile'],cwd=ROOT,check=True)
        subprocess.run([BUN,'install','--frozen-lockfile'],cwd=ROOT/'web',check=True)
    subprocess.run([BUN,'run','build'],cwd=ROOT,env=env,check=True)
    subprocess.run([BUN,'run','build'],cwd=ROOT/'web',env=env,check=True)

def start(database_only=False):
    check_versions()
    values=read_env(LOCAL/'database.env')
    port=int(values['PG_PORT'])
    for number in ([port] if database_only else [port,8080,8081,8090,3000]):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',number))==0:raise RuntimeError(f'Porta {number} ocupada; encerre o processo que já a utiliza.')
    children={};handlers=[]
    # Children receive only the credential appropriate to their role.
    common={key:value for key,value in environment().items() if not (key.startswith('PG_') or 'DATABASE_URL' in key or key.startswith('BETTER_AUTH_'))}
    common.update({'NEXT_TELEMETRY_DISABLED':'1','BLOB_STORAGE_PATH':str(ROOT/'storage/blobs')})
    def save():
        STATE.write_text(json.dumps({'supervisor':os.getpid(),**{key:proc.pid for key,proc in children.items()}},indent=2)+'\n')
        STATE.chmod(0o600)
    def launch(name,command,extra=None,cwd=ROOT,visible=False):
        logger=logging.getLogger(name);logger.setLevel(logging.INFO);logger.propagate=False
        handler=RotatingFileHandler(LOCAL/(name+'.log'),maxBytes=10*1024*1024,backupCount=3)
        handler.setFormatter(logging.Formatter('%(message)s'));logger.addHandler(handler);handlers.append(handler)
        child=subprocess.Popen(command,cwd=cwd,env={**common,**(extra or {})},stdin=None if visible else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,start_new_session=True)
        children[name]=child;save()
        def forward():
            for line in child.stdout:
                logger.info(line.rstrip())
                if visible:print(line,end='',flush=True)
        threading.Thread(target=forward,daemon=True).start()
        print(json.dumps({'event':'process.started','name':name,'pid':child.pid}),flush=True)
    def healthy():
        for name,child in children.items():
            if child.poll() is not None:raise RuntimeError(f'{name} encerrou ({child.returncode}); consulte codex-scripts/{name}.log')
    def wait_http(url):
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            healthy()
            try:
                with urlopen(url,timeout=2) as response:
                    if response.status==200:return
            except (OSError,ValueError):pass
            time.sleep(.5)
        raise RuntimeError(f'Endpoint local não ficou pronto: {url}')
    def interrupted(signum,frame):raise KeyboardInterrupt
    for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(sig,interrupted)
    try:
        launch('postgres',[str(PG/'postgres'),'-D',str(ROOT/'storage/postgresql')])
        deadline=time.monotonic()+30
        while subprocess.run([str(PG/'pg_isready'),'-h','127.0.0.1','-p',str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
            healthy()
            if time.monotonic()>deadline:raise RuntimeError('PostgreSQL não ficou pronto.')
            time.sleep(.25)
        if not database_only:
            subprocess.run([BUN,'scripts/migrate-postgres.ts','elysium'],cwd=ROOT,check=True,env=common)
            launch('qwen',qwen_command())
            launch('whisper',[str(PYTHON),'-m','uvicorn','server:app','--app-dir',str(ROOT/'whisper-service'),'--host','127.0.0.1','--port','8090','--workers','1'])
            launch('openjev',[str(PYTHON),str(ROOT/'inference-service/openjev_local.py')])
            for number in (8081,8090,8080):wait_http(f'http://127.0.0.1:{number}/health')
            for queue in ('media','inference'):
                launch(queue+'-worker',[BUN,'dist/workers/media.worker.js'],{'DATABASE_URL':values['WORKER_DATABASE_URL'],'ELYSIUM_ROLE':queue+'-worker','WORK_QUEUE':queue})
            launch('web',[BUN,'next','start','--hostname','127.0.0.1','--port','3000'],{'DATABASE_URL':values['WEB_DATABASE_URL'],'ELYSIUM_ROLE':'web',**read_env(LOCAL/'web.env')},cwd=ROOT/'web')
            wait_http('http://127.0.0.1:3000/login')
            launch('bot',[BUN,'dist/app.js'],{'DATABASE_URL':values['DATABASE_URL'],'ELYSIUM_ROLE':'gateway'},visible=True)
        print('Execução local ativa. Ctrl+C encerra todos os processos; painel: http://localhost:3000' if not database_only else 'PostgreSQL local ativo; Ctrl+C encerra.',flush=True)
        while True:healthy();time.sleep(.5)
    except KeyboardInterrupt:print('\nEncerrando os processos locais...',flush=True)
    finally:
        for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP):signal.signal(sig,signal.SIG_IGN)
        for name,child in reversed(list(children.items())):
            if child.poll() is not None:continue
            try:
                # PostgreSQL SIGINT is a clean fast shutdown; gateway flushes auth on SIGTERM.
                os.killpg(child.pid,signal.SIGINT if name=='postgres' else signal.SIGTERM)
                child.wait(timeout=40 if name=='bot' else 30)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid,signal.SIGKILL);child.wait()
                print(json.dumps({'event':'process.forced-stop','name':name}),flush=True)
            except ProcessLookupError:pass
        for handler in handlers:handler.close()
        STATE.unlink(missing_ok=True)

def main():
    os.umask(0o077);LOCAL.mkdir(exist_ok=True)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',nargs='?',default='start',choices=['start','stop','status','build','restart'])
    parser.add_argument('--database-only',action='store_true')
    args=parser.parse_args()
    if args.action=='status':print(json.dumps(live_state() or {'status':'stopped'},indent=2));return
    if args.action in ('stop','restart'):stop()
    if args.action=='stop':return
    with (LOCAL/'local-runtime.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise RuntimeError('Outro runtime ou build está em execução.')
        if args.action in ('build','restart'):build()
        if args.action!='build':start(args.database_only)

if __name__=='__main__':
    try:main()
    except (RuntimeError,OSError,subprocess.CalledProcessError) as error:
        print('Erro:',error,file=sys.stderr);sys.exit(1)
