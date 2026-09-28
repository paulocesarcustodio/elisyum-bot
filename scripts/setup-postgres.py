#!/usr/bin/env python3
"""Compile the pinned PostgreSQL locally. Never uses sudo or installs a system service."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parent.parent
BUILD=ROOT/'codex-scripts/postgres-build'
PREFIX=ROOT/'codex-scripts/postgres'
VERSION='18.6'
SHA256='555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f'

def download(url,destination,digest):
    destination.parent.mkdir(parents=True,exist_ok=True)
    def valid(file):
        with file.open('rb') as content:
            return hashlib.file_digest(content,'sha256').hexdigest()==digest
    if not destination.exists() or not valid(destination):
        temp=destination.with_suffix(destination.suffix+'.download')
        try:
            with urlopen(url,timeout=120) as response,temp.open('wb') as output:shutil.copyfileobj(response,output)
            if not valid(temp):raise RuntimeError(f'Checksum divergente: {destination.name}')
            temp.replace(destination)
        finally:temp.unlink(missing_ok=True)

def main():
    os.umask(0o077)
    binary=PREFIX/'bin/postgres'
    if binary.exists() and VERSION in subprocess.check_output([str(binary),'--version'],text=True):print('PostgreSQL '+VERSION+' já instalado localmente.');return
    for command in ['gcc','make','pkg-config','dpkg-deb']:
        if not shutil.which(command):raise RuntimeError('Ferramenta de compilação necessária: '+command)
    archive=BUILD/f'postgresql-{VERSION}.tar.bz2'
    download(f'https://ftp.postgresql.org/pub/source/v{VERSION}/{archive.name}',archive,SHA256)
    source=BUILD/f'postgresql-{VERSION}'
    if not source.exists():
        with tarfile.open(archive) as tar:tar.extractall(BUILD,filter='data')
    environment={**os.environ}
    if not shutil.which('bison') or not shutil.which('flex'):
        tools=BUILD/'tools';tools.mkdir(exist_ok=True)
        for item in json.loads((ROOT/'scripts/postgres-build-tools.json').read_text()):
            package=BUILD/item['name'];download(item['url'],package,item['sha256'])
            subprocess.run(['dpkg-deb','-x',str(package),str(tools)],check=True)
        environment.update({'PATH':str(tools/'usr/bin')+':'+environment['PATH'],'BISON_PKGDATADIR':str(tools/'usr/share/bison'),'M4':str(tools/'usr/bin/m4')})
    with (BUILD/'build.log').open('w') as log:
        for command in [['./configure','--without-readline','--prefix='+str(PREFIX)],['make','-j',str(min(os.cpu_count() or 2,4))],['make','install']]:
            subprocess.run(command,cwd=source,env=environment,stdout=log,stderr=subprocess.STDOUT,check=True)
    print(subprocess.check_output([str(binary),'--version'],text=True).strip())

if __name__=='__main__':main()
