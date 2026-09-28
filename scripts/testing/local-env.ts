import fs from 'node:fs'
import path from 'node:path'
export const projectRoot=path.resolve(import.meta.dir,'../..')
export function localEnvironment():Record<string,string> {
    const file=path.join(projectRoot,'codex-scripts/database.env')
    if(!fs.existsSync(file))throw new Error('Prepare the local PostgreSQL cluster with scripts/local-database.py.')
    return Object.fromEntries(fs.readFileSync(file,'utf8').split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>{
        const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)]
    }))
}
export function databaseUrl(base:string,name:string) {const url=new URL(base);url.pathname='/'+name;return url.toString()}
