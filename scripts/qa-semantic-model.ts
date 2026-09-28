import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
const root=path.resolve(import.meta.dir,'..')
process.chdir(mkdtempSync(path.join(tmpdir(),'elysium-semantic-qa-')))
const {getSemanticCommandsForContext}=await import('../src/helpers/semantic.registry.helper.js')
const {SemanticCommandService}=await import('../src/services/semantic-command.service.js')
const service=new SemanticCommandService()
const cases:Array<[string,string|null,boolean?]>=[
    ['por favor me mostre os comandos que você conhece','menu'],
    ['expulse esse usuário','ban'],
    ['remova a administração desse membro','rebaixar'],
    ['deixe esse membro como administrador','promover'],
    ['coloque este participante no silêncio','silenciar'],
    ['não remova nenhum participante',null],
    ['ontem fulano foi expulso do grupo',null],
    ['remova o áudio salvo chamado risada','delete'],
    ['guarde este áudio com o nome risada','save'],
    ['quais áudios estão salvos','audios'],
    ['toque o som salvo chamado risada','audio'],
    ['converta esta figurinha para uma imagem','simg'],
    ['faça um sticker desta foto','s'],
    ['quero baixar o vídeo deste link','d'],
    ['separe a trilha sonora deste vídeo','mp3'],
    ['pesquise imagens de montanhas','img'],
    ['toque a música Asa Branca','play'],
    ['amanhã vou chamar o administrador para conversar',null],
    ['apague a mensagem respondida','apg'],
    ['coloque esse membro na lista negra','addlista'],
    ['retire esse membro da lista negra','rmlista'],
    ['mostre a lista de usuários banidos permanentemente deste grupo','listanegra'],
    ['não faça nenhuma figurinha',null],
]
const rows=[]
for(const [text,expected,group=true] of cases){
    const result=await service.classify(text,getSemanticCommandsForContext(group))
    rows.push({text,expected,actual:result?.command??null,confidence:result?.confidence??null,latencyMs:result?.latencyMs??null,
        stages:result?.stages??null,correct:(result?.command??null)===expected,willInvoke:!!result&&result.confidence>=0.7})
    console.log(JSON.stringify(rows.at(-1)))
}
const report={model:process.env.OPENJEV_MODEL,total:rows.length,correct:rows.filter(x=>x.correct).length,
    correctAndExecutable:rows.filter(x=>x.correct&&(x.expected===null||x.willInvoke)).length,rows}
mkdirSync(path.join(root,'codex-scripts'),{recursive:true})
writeFileSync(path.join(root,'codex-scripts/semantic-extended-qa.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({total:report.total,correct:report.correct,correctAndExecutable:report.correctAndExecutable}))
process.exit(0)
