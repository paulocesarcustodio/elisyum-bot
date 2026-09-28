import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {LlamaJsonIntentParser,OpenJevIntentParser} from '../src/infrastructure/intent-parser.js'
import {commandCatalog} from '../src/application/command-catalog.js'
const fixture=readFileSync(new URL('./fixtures/intent-heldout.json',import.meta.url),'utf8')
const cases=JSON.parse(fixture)
const commands=commandCatalog().filter(command=>command.naturalCommand && command.category!=='admin').map(({name,description})=>({name,description}))
const results:any[]=[]
for(const [name,parser] of [['openjev',new OpenJevIntentParser()],['direct',new LlamaJsonIntentParser()]] as const){
 for(const entry of cases){
  try{
   const result=await parser.parse(entry.text,commands,entry.context || 'Grupo WhatsApp; sem mídia ou mensagem respondida, salvo quando explicitado.')
   const selected=result.needsClarification?null:result.command
   const commandCorrect=selected===entry.command
   const argsCorrect=entry.command===null || entry.argsAny || JSON.stringify(result.args)===JSON.stringify(entry.args)
   const targetCorrect=!entry.target || result.targetText?.toLowerCase()===entry.target.toLowerCase()
   results.push({parser:name,text:entry.text,expected:entry.command,actual:selected,commandCorrect,argsCorrect,targetCorrect,latencyMs:Math.round(result.latencyMs),result})
  }catch(error){results.push({parser:name,text:entry.text,error:(error as Error).message,commandCorrect:false,argsCorrect:false,targetCorrect:false})}
  console.log(JSON.stringify(results.at(-1)))
 }
}
const summaries=Object.fromEntries(['openjev','direct'].map(name=>{
 const rows=results.filter(result=>result.parser===name),times=rows.map(row=>row.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b)
 return [name,{total:rows.length,commandCorrect:rows.filter(row=>row.commandCorrect).length,completeCorrect:rows.filter(row=>row.commandCorrect&&row.argsCorrect&&row.targetCorrect).length,medianMs:times[Math.floor(times.length/2)] ?? null,p95Ms:times[Math.floor(times.length*.95)] ?? null}]
}))
const directEligible=summaries.direct.completeCorrect===cases.length && summaries.direct.commandCorrect>=summaries.openjev.commandCorrect && summaries.direct.medianMs<=summaries.openjev.medianMs*1.5
const report={corpusSha256:createHash('sha256').update(fixture).digest('hex'),model:'Qwen3.5-2B-Q4_K_M',llamaBuild:'b11222',selected:'openjev',directEligible,summaries,results}
writeFileSync(new URL('../codex-scripts/intent-parser-comparison.json',import.meta.url),JSON.stringify(report,null,2))
console.log(JSON.stringify({summaries,directEligible,selected:report.selected}))
process.exit(0)
