#!/usr/bin/env bun
// Backwards-compatible entry point. The local supervisor owns every process.
import {spawn} from 'node:child_process'
if(process.argv.slice(2).some(arg=>arg.startsWith('--clear-session'))){
    console.error('A sessão agora fica no PostgreSQL. Nenhuma credencial foi removida. Consulte docs/operacao-local.md.')
    process.exit(1)
}
const child=spawn('python3',['scripts/local-runtime.py','start'],{stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal))
child.once('error',error=>{console.error(error.message);process.exit(1)})
child.once('exit',code=>process.exit(code ?? 1))
