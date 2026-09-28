import type {IntentParser,IntentCandidate,ParsedIntent} from '../domain/contracts.js'
import {workSignal} from './subprocess.js'
import {isPastEventReport,hasBotWakeWord,stripBotWakeWord} from '../utils/semantic-intent.util.js'

/** Experimental direct parser. The default remains OpenJev until held-out parity. */
export class LlamaJsonIntentParser implements IntentParser {
    async parse(text:string,commands:IntentCandidate[],context=''):Promise<ParsedIntent>{
        const started=performance.now()
        const none=(clarify=false):ParsedIntent=>({command:null,args:[],needsClarification:clarify,latencyMs:performance.now()-started})
        if(!hasBotWakeWord(text))return none()
        const request=stripBotWakeWord(text)
        if(!request.trim() || /^(?:por favor[,\s]+)*(?:n[aã]o|nunca|nem)\b/i.test(request.trim()) || isPastEventReport(request))return none()
        const names=commands.map(command=>command.name)
        const schema={type:'object',additionalProperties:false,properties:{
            command:{type:'string',enum:['none',...names]},
            args:{type:'array',items:{type:'string'},maxItems:16},
            targetText:{type:'string'},
            needsClarification:{type:'boolean'},
        },required:['command','args','targetText','needsClarification']}
        const signal=AbortSignal.any([AbortSignal.timeout(Number(process.env.INTENT_TIMEOUT_MS || 15_000)),...workSignal.getStore()?[workSignal.getStore()!]:[]])
        const response=await fetch((process.env.LLAMA_URL || 'http://127.0.0.1:8081')+'/v1/chat/completions',{
            method:'POST',headers:{'Content-Type':'application/json'},signal,
            body:JSON.stringify({model:process.env.LLAMA_MODEL || 'local',temperature:0,max_tokens:192,cache_prompt:true,
                chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_object',schema},
                messages:[
                    {role:'system',content:`Interprete um único pedido atual dirigido ao bot. Retorne apenas o JSON do esquema. Escolha somente um comando da lista. Conversas, relatos passados, negações e comandos não oferecidos retornam command=none. Pedidos ambíguos ou sem argumento obrigatório retornam needsClarification=true. Nunca invente nome de mídia, URL, telefone ou identificador de pessoa. args contém apenas os argumentos literais do pedido, sem instruções ou cortesias; para ações sobre pessoas args=[] e targetText é o nome mencionado (ou vazio quando o contexto já tem a pessoa respondida). Para mídia respondida não invente argumentos. A lista não dá autorização para executar; você somente interpreta.\nComandos:\n${commands.map(command=>`${command.name}: ${command.description}`).join('\n')}`},
                    {role:'user',content:JSON.stringify({pedido:request,contexto:context})},
                ],
            }),
        })
        if(!response.ok)throw new Error(`Interpretador local indisponível (${response.status}).`)
        const payload=await response.json() as any
        const parsed=JSON.parse(payload.choices?.[0]?.message?.content || '{}')
        if(!['none',...names].includes(parsed.command) || !Array.isArray(parsed.args) || parsed.args.length>16 || parsed.args.some((arg:unknown)=>typeof arg!=='string'||arg.length>8192||arg.includes('\0')) || typeof parsed.needsClarification!=='boolean' || typeof parsed.targetText!=='string' || parsed.targetText.length>200)throw new Error('O interpretador devolveu uma resposta inválida.')
        return {command:parsed.command==='none'?null:parsed.command,args:parsed.args,targetText:parsed.targetText || undefined,needsClarification:parsed.needsClarification,latencyMs:performance.now()-started}
    }
}
export class OpenJevIntentParser implements IntentParser {
    async parse(text:string,commands:IntentCandidate[],context=''):Promise<ParsedIntent>{
        const started=performance.now()
        if(!hasBotWakeWord(text))return {command:null,args:[],needsClarification:false,latencyMs:performance.now()-started}
        const {SemanticCommandService}=await import('../services/semantic-command.service.js')
        const {semanticCommands}=await import('../helpers/semantic.registry.helper.js')
        const {extractSemanticArguments,extractTargetName}=await import('../helpers/semantic-command.helper.js')
        const available=semanticCommands.filter(command=>commands.some(candidate=>candidate.name===command.name))
        const decision=await new SemanticCommandService().classify(stripBotWakeWord(text),available,context)
        const command=decision && decision.confidence>=Number(process.env.SEMANTIC_COMMAND_THRESHOLD || 0.7)?decision.command:null
        return {command,args:command?extractSemanticArguments(text,command):[],targetText:command?extractTargetName(text,command):undefined,needsClarification:!command,latencyMs:performance.now()-started}
    }
}
