/** Every help surface comes from the same catalog as execution and inference. */
import { commandCatalog, type CatalogCommand } from '../src/application/command-catalog.js'
import fs from 'node:fs'
import path from 'node:path'
const catalog=commandCatalog()
const clean=(value:string)=>value.split('\n').map(line=>line.trimEnd()).join('\n').trimEnd()+'\n'
function render(command:CatalogCommand){
    const aliases=command.aliases.length?`Atalhos: ${command.aliases.map(alias=>'!'+alias).join(', ')}\n`:''
    const roles=command.roles.length?`Permissão: ${command.roles.join(' ou ')}.\n`:''
    const examples=command.examples.length?`Pedidos naturais (comece com “bot”): ${command.examples.join('; ')}.\n`:''
    return `!${command.name} — ${command.description}\n${aliases}${roles}${String(command.guide || '').replaceAll('{$p}','!')}\n${examples}${command.confirmation?'Pedidos naturais exigem confirmação com “bot confirmar”; cancele com “bot cancelar”.\n':''}\n`
}
const user=catalog.filter(command=>['info','utility'].includes(command.category))
const group=catalog.filter(command=>command.category==='group')
const admin=catalog.filter(command=>command.category==='admin')
const header='GUIA DE COMANDOS DO ELISYUM BOT\nGerado pelo catálogo usado na execução. Linguagem natural exige a palavra “bot”.\n\n'
const outputs:Record<string,CatalogCommand[]>={
    'ai-friendly-usuario.txt':user,'comandos-usuario.txt':user,
    'ai-friendly-groupadmin.txt':[...user,...group],
    'ai-friendly-owner.txt':catalog,
    'ai-friendly-admin.txt':admin,'comandos-admin.txt':admin,
}
const dir=path.resolve('docs/commands');fs.mkdirSync(dir,{recursive:true})
for(const [file,commands] of Object.entries(outputs))fs.writeFileSync(path.join(dir,file),clean(header+commands.map(render).join('')))
fs.writeFileSync(path.resolve('docs/reference/COMANDOS.md'),clean(`# Comandos ativos\n\nEste arquivo é gerado por \`bun run docs:commands\`. Total: ${catalog.length} comandos.\n\n`+Object.entries({Informação:catalog.filter(c=>c.category==='info'),Utilidade:user.filter(c=>c.category==='utility'),Grupos:group,Administração:admin}).map(([label,commands])=>`## ${label}\n\n${commands.map(render).join('\n')}`).join('\n')))
console.log(`Documentação gerada: ${catalog.length} comandos, ${Object.keys(outputs).length} guias.`)
process.exit(0)
