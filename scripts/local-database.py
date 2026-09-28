#!/usr/bin/env python3
"""Prepare a private PostgreSQL cluster; never installs or controls system services."""
import argparse
import getpass
import os
from pathlib import Path
import secrets
import subprocess
from urllib.parse import quote, urlparse

ROOT = Path(__file__).resolve().parent.parent
BIN = ROOT / 'codex-scripts/postgres/bin'
DATA = ROOT / 'storage/postgresql'
ENV = ROOT / 'codex-scripts/database.env'
SOCKET = ROOT / 'codex-scripts/postgres-socket'
PORT = 55432


def read_environment():
    return dict(line.split('=', 1) for line in ENV.read_text().splitlines() if line and not line.startswith('#'))


def prepare():
    if not (BIN / 'initdb').exists():
        raise RuntimeError('Run scripts/setup-postgres.py before initializing the database.')
    if (DATA / 'PG_VERSION').exists() and not ENV.exists():
        raise RuntimeError('O cluster já existe, mas database.env está ausente. Restaure as credenciais do backup; elas não serão recriadas.')
    SOCKET.mkdir(parents=True, exist_ok=True, mode=0o700)
    SOCKET.chmod(0o700)
    if not ENV.exists():
        admin = getpass.getuser()
        values = {'PG_PORT': str(PORT), 'PG_ADMIN_USER': admin, 'PG_ADMIN_PASSWORD': secrets.token_hex(24)}
        for name in ('gateway', 'worker', 'web'):
            values[f'PG_{name.upper()}_PASSWORD'] = secrets.token_hex(24)
        values['MIGRATION_DATABASE_URL'] = f"postgresql://{quote(admin)}:{values['PG_ADMIN_PASSWORD']}@127.0.0.1:{PORT}/elysium"
        for key, role in [('DATABASE_URL','gateway'),('WORKER_DATABASE_URL','worker'),('WEB_DATABASE_URL','web')]:
            values[key] = f"postgresql://elysium_{role}:{values[f'PG_{role.upper()}_PASSWORD']}@127.0.0.1:{PORT}/elysium"
        ENV.write_text('\n'.join(f'{key}={value}' for key,value in values.items())+'\n')
        ENV.chmod(0o600)
    values = read_environment()
    if not (DATA / 'PG_VERSION').exists():
        DATA.mkdir(parents=True, mode=0o700)
        password = ROOT / 'codex-scripts/.postgres-init-password'
        password.write_text(values['PG_ADMIN_PASSWORD']+'\n')
        password.chmod(0o600)
        try:
            subprocess.run([str(BIN/'initdb'),'-D',str(DATA),'--encoding=UTF8','--locale=C.UTF-8',
                '--auth-local=peer','--auth-host=scram-sha-256','--username='+values['PG_ADMIN_USER'],
                '--pwfile='+str(password)],check=True)
        finally:
            password.unlink(missing_ok=True)
        with (DATA/'postgresql.conf').open('a') as file:
            file.write(f"\nlisten_addresses = '127.0.0.1'\nport = {PORT}\nunix_socket_directories = '{SOCKET}'\nmax_connections = 80\nshared_buffers = '128MB'\npassword_encryption = 'scram-sha-256'\nlog_min_duration_statement = 1000\nlog_parameter_max_length = 0\nlog_parameter_max_length_on_error = 0\n")
    print('Private cluster ready:', DATA)


def bootstrap():
    values = read_environment()
    env = {**os.environ,'PGPASSWORD':values['PG_ADMIN_PASSWORD']}
    command = [str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(PORT),'-U',values['PG_ADMIN_USER'],'-d','postgres']
    statements=[]
    for role in ('gateway','worker','web'):
        name = 'elysium_'+role
        password = values[f'PG_{role.upper()}_PASSWORD']
        statements.append(f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='{name}') THEN CREATE ROLE {name} LOGIN PASSWORD '{password}'; END IF; END $$;")
    subprocess.run(command,input='\n'.join(statements),text=True,env=env,stdout=subprocess.DEVNULL,check=True)
    for name in ('elysium','elysium_stage'):
        found=subprocess.check_output(command+['-tAc',f"SELECT 1 FROM pg_database WHERE datname='{name}'"],env=env,text=True).strip()
        if not found:
            subprocess.run(command+['-c',f'CREATE DATABASE {name}'],env=env,stdout=subprocess.DEVNULL,check=True)
    print('Database roles and migration rehearsal database ready.')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['init','bootstrap'])
    args=parser.parse_args()
    prepare() if args.action=='init' else bootstrap()
