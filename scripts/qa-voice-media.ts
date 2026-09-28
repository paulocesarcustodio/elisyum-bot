/** Route spoken requests with real context handling, but no WhatsApp side effects. */
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

process.chdir(mkdtempSync(path.join(tmpdir(),'elysium-voice-media-')))
process.env.SEMANTIC_COMMANDS_ENABLED='true'
process.env.OPENJEV_URL='http://127.0.0.1:1'
const {createTestDatabase}=await import('./testing/database.js')
const testDatabase=await createTestDatabase()
try {
const {routeSemanticCommand,extractSemanticArguments}=await import('../src/helpers/semantic-command.helper.js')
const {getTextOrQuotedText}=await import('../src/utils/general.util.js')
const {matchExplicitIntent}=await import('../src/utils/semantic-intent.util.js')
const bot:any={prefix:'!',host_number:'5511999000001@s.whatsapp.net',block_cmds:[]}
const group:any={id:'voice-qa@g.us',block_cmds:[]}
const replies:any[]=[]
const client:any={sendMessage:async(...args:any[])=>{replies.push(args);return {key:{id:'response'}}}}
let sequence=0
const voice=(text:string,quote?:any):any=>({
    message_id:`qa-${++sequence}`,sender:'5511999000002@s.whatsapp.net',chat_id:group.id,
    body:'',caption:'',command:'',args:[],text_command:'',mentioned:[],isGroupMsg:true,
    isGroupAdmin:false,isBotAdmin:true,isBotOwner:false,isBotMessage:false,isBroadcast:false,
    type:'audioMessage',media:{seconds:7,url:'https://media.invalid/voice.enc'},isMedia:true,
    semanticSource:'audio',semanticTranscript:text,isQuoted:!!quote,quotedMessage:quote,
    wa_message:{key:{id:`qa-${sequence}`,remoteJid:group.id},message:{audioMessage:{seconds:7}}},
})
const link='https://www.youtube.com/watch?v=jNQXAC9IVRw&feature=share'
const quotedLink={type:'conversation',sender:bot.host_number,body:`Link do vídeo: ${link}`,caption:''}
const image={type:'imageMessage',sender:bot.host_number,body:'',caption:'Foto de teste',media:{url:'https://media.invalid/image.enc'}}
const cases:Array<[string,string,string[],any?]>=[
    ['Bot, você pode baixar a música Asa Branca de Luiz Gonzaga pra mim?','play',['Asa Branca de Luiz Gonzaga']],
    ['Bot, poderia tocar a música Não Precisa, por favor?','play',['Não Precisa']],
    ['Bot, queria baixar a música Evidências para mim.','play',['Evidências']],
    ['Bot, baixa o vídeo desse link pra mim, por favor.','d',[link],quotedLink],
    ['Bot, consegue mandar o vídeo desta mensagem?','d',[link],quotedLink],
    ['Bot, baixe a música desse link por favor.','play',[link],quotedLink],
    ['Bot, baixe o vídeo Me at the zoo.','d',['Me at the zoo']],
    ['Bot, faz uma figurinha dessa foto pra mim? Por favor!','s',[],image],
    ['Bot, você pode transformar esta imagem numa figurinha, por favor?','s',[],image],
]
for(const [text,command,args,quote] of cases){
    const message=voice(text,quote)
    assert.deepEqual(await routeSemanticCommand(client,bot,message,group),{status:'handled',invoke:true},text)
    assert.equal(message.command,`!${command}`,text)
    assert.deepEqual(message.args,args,text)
    if(command!=='s') assert.equal(getTextOrQuotedText(message),args.join(' '),text)
    if(quote) assert.equal(message.quotedMessage,quote,'Source context changed')
}
// All natural commands now require the user's chosen wake word, consistently
// for text/voice, private/group chats, mentions and replies to the bot.
const reported='Baixe o vídeo under the bridge do red hot chili peppers'
for(const source of ['text','audio'] as const) for(const isGroupMsg of [true,false]) for(const [request,quote] of [
    [reported,undefined],['baixe a música Asa Branca',undefined],['faz uma figurinha dessa foto',image],
    ['mostre o menu',quotedLink],['@5511999000001 baixe o vídeo Me at the zoo',undefined],
] as const){
    const message=voice(request,quote)
    message.isGroupMsg=isGroupMsg
    message.hasBotMention=true
    message.mentioned=[bot.host_number]
    if(source==='text') Object.assign(message,{
        type:'conversation',body:request,command:request.split(' ')[0],semanticTranscript:undefined,
        semanticSource:undefined,media:undefined,isMedia:false,
    })
    assert.deepEqual(await routeSemanticCommand(client,bot,message,isGroupMsg?group:null),{status:'not-applicable'},`${source}: no wake word`)
}
for(const prefix of ['Bot,','BOT:','bot.','Ei, bot','bot -']){
    const message=voice(`${prefix} ${reported}`)
    assert.deepEqual(await routeSemanticCommand(client,bot,message,group),{status:'handled',invoke:true})
    assert.equal(message.command,'!d')
    assert.deepEqual(message.args,['under the bridge do red hot chili peppers'])
}
for(const block of ['group','global'] as const){
    const message=voice(`Bot, ${reported}`)
    const blockedBot={...bot,block_cmds:block==='global'?['d']:[]}
    const blockedGroup={...group,block_cmds:block==='group'?['d']:[]}
    assert.deepEqual(await routeSemanticCommand(client,blockedBot,message,blockedGroup),{status:'not-applicable'})
    assert.equal(message.command,'')
}
for(const text of ['Bot, baixa o vídeo desse link pra mim.', 'Bot, baixe a música desse link.']) {
    assert.deepEqual(await routeSemanticCommand(client,bot,voice(text),group),{status:'handled',invoke:false})
    assert.match(replies.at(-1)[1].text,/contém o link/)
}
assert.equal(matchExplicitIntent('Bot, não baixe a música Asa Branca.',false),null)
assert.equal(matchExplicitIntent('Ontem eu pedi para baixar a música Asa Branca.',false),null)
assert.equal(matchExplicitIntent('João disse para fazer uma figurinha dessa foto.',true),null)
assert.equal(matchExplicitIntent('Ontem João pediu para baixar o vídeo Under the Bridge.',false),null)
assert.equal(matchExplicitIntent('Não baixe o vídeo Under the Bridge.',false),null)
assert.deepEqual(extractSemanticArguments('Bot, baixa o vídeo desse link pra mim, por favor.','d',quotedLink.body),[link])
const quotedWithoutArgs=voice('Bot, baixa esse link.',quotedLink)
assert.equal(getTextOrQuotedText(quotedWithoutArgs),link)
console.log(`Voice media regression: ${cases.length + 5} active routes, 20 no-wake cases, blocking and missing-source cases passed`)


} finally {await testDatabase.close()}

process.exit(0)
