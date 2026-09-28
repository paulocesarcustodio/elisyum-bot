/** Integration scenarios using real controllers/PostgreSQL/storage and a fake WhatsApp transport.
 * No real contacts, sessions, database, or group membership are used.
 * Run: bun scripts/qa-core-commands.ts
 */
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spyOn} from 'bun:test'

const root = path.resolve(import.meta.dir, '..')
const sandbox = mkdtempSync(path.join(tmpdir(), 'elysium-command-qa-'))
process.chdir(sandbox)
mkdirSync('storage')
copyFileSync(path.join(root, 'package.json'), 'package.json')
// The app reads these credentials only from the real runtime, never from tests.
delete process.env.GOOGLE_AI_API_KEY
const {createTestDatabase} = await import('./testing/database.js')
const testDatabase = await createTestDatabase()
try {
const {GroupController} = await import('../src/controllers/group.controller.js')
const {UserController} = await import('../src/controllers/user.controller.js')
const {BotController} = await import('../src/controllers/bot.controller.js')
const {db, logsDb, audiosDb, askCacheDb} = await import('../src/database/db.js')
const wa = await import('../src/utils/whatsapp.util.js')
const {commandInvoker} = await import('../src/helpers/command.invoker.helper.js')
const {getCommandGuide, commandExist, getCommandDefinition} = await import('../src/utils/commands.util.js')
const {REMOVED_COMMAND_NAMES} = await import('../src/commands/removed.commands.js')
const {findSimilarCommand} = await import('../src/helpers/command.fuzzy.helper.js')
const {semanticCommands} = await import('../src/helpers/semantic.registry.helper.js')
const menus = await import('../src/helpers/menu.builder.helper.js')
const {buildText} = await import('../src/utils/general.util.js')
const info = (await import('../src/commands/info.list.commands.js')).default
const utility = (await import('../src/commands/utility.list.commands.js')).default
const groupCommands = (await import('../src/commands/group.list.commands.js')).default
const admin = (await import('../src/commands/admin.list.commands.js')).default
const registry: Record<string, any> = {...info, ...utility, ...groupCommands, ...admin}

const groupId = '120000000000000000@g.us'
const owner = '5511999990001@s.whatsapp.net'
const host = '5511999990002@s.whatsapp.net'
const member = '5511999990003@s.whatsapp.net'
const moderator = '5511999990004@s.whatsapp.net'
const groups = new GroupController(), users = new UserController(), bots = new BotController()
const metadata = {id: groupId, subject: 'Grupo fictício QA', owner, participants: [
    {id:owner, admin:'superadmin', notify:'Dono QA'}, {id:host, admin:'admin', notify:'Bot QA'},
    {id:member, admin:null, notify:'Membro QA'}, {id:moderator, admin:'admin', notify:'Moderador QA'}
]}
await groups.registerGroup(metadata as any)
for (const entry of metadata.participants) await users.registerUser(entry.id, entry.notify)
await users.registerOwner(owner)
await users.setHelpLevel(owner, 'simple')
await bots.startBot(host)
const operations: Array<{kind:string,args:any[]}> = []
let blocked: string[] = []
const client: any = {
    user: {id: host},
    sendPresenceUpdate: async()=>{},
    sendReceipt: async()=>{},
    profilePictureUrl: async()=>undefined,
    sendMessage: async (...args: any[]) => {operations.push({kind:'send',args});return {key:{id:`qa-${operations.length}`,remoteJid:args[0]}}},
    groupMetadata: async () => metadata,
    groupParticipantsUpdate: async (...args: any[]) => {operations.push({kind:'participants',args});return args[1].map((jid:string)=>({jid,status:'200'}))},
    groupSettingUpdate: async (...args:any[]) => {operations.push({kind:'setting',args})},
    groupInviteCode: async () => 'QATestOnlyNotARealInvite',
    groupRevokeInvite: async (...args:any[]) => {operations.push({kind:'revoke',args});return 'QANewTestOnlyInvite'},
    groupAcceptInvite: async (...args:any[]) => {operations.push({kind:'join',args});return groupId},
    groupLeave: async (...args:any[]) => {operations.push({kind:'leave',args})},
    updateProfilePicture: async (...args:any[]) => {operations.push({kind:'picture',args})},
    updateProfileName: async (...args:any[]) => {operations.push({kind:'name',args})},
    updateProfileStatus: async (...args:any[]) => {operations.push({kind:'status',args})},
    fetchBlocklist: async () => blocked,
    updateBlockStatus: async (jid:string, action:string) => {blocked=action==='block'?[...blocked,jid]:blocked.filter(x=>x!==jid);operations.push({kind:'block',args:[jid,action]})},
    onWhatsApp: async (...jids:string[]) => jids.map(jid=>({jid,exists:true})),
    end: (...args:any[]) => {operations.push({kind:'end',args})},
}
const image = readFileSync(path.join(root,'src/media/frasewhatsappjr.png'))
for (const args of [
    ['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libopus','audio.ogg'],
    ['-f','lavfi','-i','color=c=blue:s=320x240:r=12','-i','audio.ogg','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','video.mp4']
]) {
    const result=Bun.spawnSync(['ffmpeg','-loglevel','error','-y',...args])
    assert.equal(result.exitCode,0,result.stderr.toString())
}
const fixtures: Record<string,Buffer> = {imageMessage:image,audioMessage:readFileSync('audio.ogg'),videoMessage:readFileSync('video.mp4')}
spyOn(wa,'downloadMessageAsBuffer').mockImplementation(async(_client:any, source:any)=>fixtures[source.__fixture||Object.keys(source.message||{})[0]]||image)
const quote = (type='conversation', sender=member) => ({type,sender,pushname:'Membro QA',body:'Mensagem fictícia',caption:'',mentioned:[],isMedia:type!=='conversation',media:type==='conversation'?undefined:{mimetype:type==='audioMessage'?'audio/ogg; codecs=opus':type==='videoMessage'?'video/mp4':'image/png',seconds:1,file_length:(fixtures[type]||image).length,url:''},wa_message:{__fixture:type,key:{remoteJid:groupId,participant:sender,id:'quoted-fixture'},message:{conversation:'Mensagem fictícia'}}})
let sequence = 0
function message(name:string, args:string[]=[], extra:any={}) {
    return {message_id:`qa-${++sequence}`,sender:owner,type:'conversation',t:Date.now()/1000,chat_id:groupId,pushname:'Dono QA',body:`!${name} ${args.join(' ')}`,caption:'',mentioned:[],text_command:args.join(' '),command:`!${name}`,args,isQuoted:false,isGroupMsg:true,isGroupAdmin:true,isBotAdmin:true,isBotOwner:true,isBotMessage:false,isBroadcast:false,isMedia:false,wa_message:{key:{id:`qa-${sequence}`,remoteJid:groupId,participant:owner},message:{conversation:`!${name}`}},...extra} as any
}
const report: any[] = []
async function run(name:string,args:string[]=[],extra:any={},check?:()=>Promise<void>|void) {
    const start = operations.length
    try {
        const bot = (await bots.getBot())!
        const group = (await groups.getGroup(groupId))!
        await registry[name].function(client,bot,message(name,args,extra),group)
        assert(operations.length>start,`${name} did not emit an action or response`)
        const output = operations.slice(start).filter(x=>x.kind==='send').map(x=>x.args[1].text||'').join('\n')
        assert(!/\{\$[p\d]+\}/.test(output),`${name}: unresolved template variable`)
        assert(!/❌ Erro:/.test(output),`${name}: ${output}`)
        await check?.()
        report.push({name,status:'pass',transport:'fake',actions:operations.slice(start).map(x=>x.kind)})
    } catch(error) {report.push({name,status:'fail',error:String(error)})}
}

// Every registered guide must resolve without leaking internal placeholders.
for (const name of Object.keys(registry)) {
    const guide = getCommandGuide('!',`!${name}`)
    assert(guide.length>15 && !guide.includes('{$p}'),`Missing guide: ${name}`)
}
assert.equal(buildText('{$1}', 'Use {$p}s and $&'), 'Use !s and $&')

// Removed commands must disappear from execution, inference, menus and help.
assert.deepEqual(Object.keys(info), ['menu'])
const renderedMenus = Object.values(menus).map(render => render(bots.getBot())).join('\n')
const helpFiles = ['ai-friendly-usuario.txt', 'ai-friendly-groupadmin.txt', 'ai-friendly-owner.txt', 'ai-friendly-admin.txt', 'comandos-usuario.txt', 'comandos-admin.txt']
const helpContent = helpFiles.map(file => readFileSync(path.join(root, 'docs/commands', file), 'utf8')).join('\n')
for (const name of REMOVED_COMMAND_NAMES) {
    assert.equal(commandExist('!', `!${name}`), false)
    assert.equal(getCommandDefinition(name), undefined)
    assert.equal(findSimilarCommand(name), null, `Removed command was autocorrected: ${name}`)
    assert(!semanticCommands.some(command => command.name === name))
    const reference = new RegExp(`!${name}\\b`)
    assert(!reference.test(renderedMenus), `Removed command in menu: ${name}`)
    assert(!reference.test(helpContent), `Removed command in help: ${name}`)
    const before = operations.length
    await commandInvoker(client, bots.getBot(), message(name), await groups.getGroup(groupId))
    assert.equal(operations.length, before, `Removed command produced an operation: ${name}`)
}
assert(!renderedMenus.includes('!menu* 0'))
await assert.rejects(() => registry.menu.function(client, bots.getBot(), message('menu', ['0']), null))

// Old cached advice cannot bring removed commands back into the assistant.
const {getCachedAnswer, setCachedAnswer} = await import('../src/helpers/ask.cache.helper.js')
const oldQuestion = 'como ver meus dados'
await askCacheDb.set(createHash('sha256').update(oldQuestion).digest('hex'), oldQuestion, 'Use !meusdados', 'owner')
assert.equal(await getCachedAnswer(oldQuestion, true, false), null)
await setCachedAnswer(oldQuestion, 'Consulte !menu para ver os comandos disponíveis.', true, false)
assert.match((await getCachedAnswer(oldQuestion, true, false))!, /!menu/)

for (const name of ['menu','admin','ping']) await run(name)
await run('config',['ajuda'])
await run('silenciar',[],{mentioned:[member]},async()=>assert.equal(await groups.isParticipantMuted(groupId,member),true))
await run('silenciar',[],{mentioned:[member]},async()=>assert.equal(await groups.isParticipantMuted(groupId,member),false))
await run('addlista',[],{mentioned:[member]},async()=>assert((await groups.getGroup(groupId))?.blacklist.includes(member)))
await run('listanegra')
await run('rmlista',['1'],{},async()=>assert(!(await groups.getGroup(groupId))?.blacklist.includes(member)))
await run('add',['5511999990005'])
await run('add',['+55 (11) 99999-0005,','5511999990006'],{},()=>{
    const additions=operations.filter(x=>x.kind==='participants'&&x.args[2]==='add').slice(-2)
    assert.deepEqual(additions.map(x=>x.args[1][0]),['5511999990005@s.whatsapp.net','5511999990006@s.whatsapp.net'])
})
await run('ban',[],{mentioned:[member]})
await run('promover',[],{mentioned:[member]})
await run('rebaixar',[],{mentioned:[moderator]})
await run('apg',[],{isQuoted:true,quotedMessage:quote(),wa_message:{key:{remoteJid:groupId,participant:owner,id:'qa-delete'},message:{extendedTextMessage:{text:'!apg',contextInfo:{stanzaId:'quoted-fixture',participant:member}}}}})
await run('comandospv')
await run('taxacomandos',['8','60'])
await bots.setCommandRate(false)
for (const args of [['1'], ['8','0'], ['8','abc'], ['3.5']]) {
    await assert.rejects(()=>registry.taxacomandos.function(client,bots.getBot(),message('taxacomandos',args)),undefined,`Invalid rate accepted: ${args}`)
}
await run('bloquear',['5511999990003'])
await run('listablock')
await run('desbloquear',['5511999990003'])
await run('usuario',['5511999990003'])
await run('vtnc',[],{mentioned:[member]})

// Real codecs, file storage and command logic, with external downloads replaced by fixtures.
const download = await import('../src/utils/download.util.js')
spyOn(download,'youtubeMedia').mockImplementation(async()=>({id_video:'QATestVideo',title:'Vídeo fictício',duration:1,duration_formatted:'0:01',is_live:false} as any))
spyOn(download,'downloadYouTubeVideo').mockImplementation(async()=>fixtures.videoMessage)
spyOn(download,'downloadYouTubeAudio').mockImplementation(async()=>fixtures.audioMessage)
const images = await import('../src/utils/image.util.js')
spyOn(images,'imageSearchGoogle').mockImplementation(async()=>[{url:'https://qa.invalid/one.png'},{url:'https://qa.invalid/two.png'}] as any)
await run('d',['https://www.youtube.com/watch?v=QATestVideo'])
const pinMetadata=spyOn(download,'pinterestMedia').mockResolvedValue({type:'video',url:'https://www.pinterest.com/pin/123/',title:'QA'})
const pinVideo=spyOn(download,'downloadPinterestVideo').mockImplementation(async(_url,onProgress)=>{await onProgress?.(37);await onProgress?.(100);return fixtures.videoMessage})
await run('d',['https://www.pinterest.com/pin/123/'],{},()=>{
    assert(operations.at(-2)?.args[1].video,'Pinterest video not sent')
})
pinMetadata.mockResolvedValue({type:'image',url:'https://i.pinimg.com/test.jpg',title:'QA image'})
const pinImage=spyOn(download,'downloadFromUrl').mockImplementation(async(_url,onProgress)=>{await onProgress?.(50);await onProgress?.(100);return image})
await run('d',['https://pin.it/QATest'],{},()=>{
    assert(operations.at(-2)?.args[1].image,'Pinterest image not sent')
})
pinMetadata.mockRestore();pinVideo.mockRestore();pinImage.mockRestore()
const xMetadata=spyOn(download,'xMedia').mockResolvedValue({text:'QA',media:[{type:'video',url:'https://qa.invalid/video.mp4'}]})
const failedVideo=spyOn(download,'downloadVideoFromUrl').mockImplementation(async(_url,onProgress)=>{
    await onProgress?.(37)
    throw new Error('Falha de rede simulada')
})
await assert.rejects(()=>registry.d.function(client,bots.getBot(),message('d',['https://x.com/qa/status/123'])),/Falha de rede simulada/)
assert.match(operations.at(-1)!.args[1].text,/❌ Erro: Falha de rede simulada/)
await Bun.sleep(50)
assert.match(operations.at(-1)!.args[1].text,/❌ Erro: Falha de rede simulada/,'Old progress replaced terminal error')
report.push({name:'d:error-status',status:'pass',transport:'fake',actions:['progress','error']})
xMetadata.mockRestore();failedVideo.mockRestore()
await run('play',['Música fictícia'])
await run('mp3',[],{isQuoted:true,quotedMessage:quote('videoMessage')})
await run('img',['Imagem de teste'])
await run('s',[],{isQuoted:true,quotedMessage:quote('imageMessage')},()=>{
    fixtures.stickerMessage=operations.at(-1)!.args[1].sticker
    assert(fixtures.stickerMessage.length>100)
})
await run('s',['1'],{isQuoted:true,quotedMessage:quote('imageMessage')})
await run('s',['2'],{isQuoted:true,quotedMessage:quote('imageMessage')})
await run('s',[],{isQuoted:true,quotedMessage:quote('videoMessage')})
await run('s',[],{isQuoted:true,quotedMessage:quote()})
await run('simg',[],{isQuoted:true,quotedMessage:quote('stickerMessage')})
await run('revelar',[],{isQuoted:true,quotedMessage:{...quote('viewOnceMessageV2'),wa_message:{key:{id:'qa-view-once',remoteJid:groupId},message:{viewOnceMessageV2:{message:{imageMessage:{caption:'Imagem fictícia',mimetype:'image/png'}}}}}}})
await run('save',['qa-audio'],{isQuoted:true,quotedMessage:quote('audioMessage')},async()=>assert(await audiosDb.get('qa-audio')))
await run('audios')
await run('audio',['qa-audio'])
await run('rename',['qa-audio','|','qa-renamed'],{},async()=>{assert(await audiosDb.get('qa-renamed'));assert(!await audiosDb.get('qa-audio'))})
const axios=(await import('axios')).default
spyOn(axios,'get').mockImplementation(async()=>({data:image}) as any)
client.profilePictureUrl=async()=> 'https://qa.invalid/avatar.png'
await run('v',['qa-renamed'],{isQuoted:true,quotedMessage:quote('conversation','5511999990005@s.whatsapp.net')})
await run('delete',['qa-renamed'],{},async()=>assert(!await audiosDb.get('qa-renamed')))
await run('ask',['Como criar uma figurinha?'],{},()=>assert.match(operations.at(-1)!.args[1].text,/Use \*!s\*/))

// Updates from one controller are immediately visible to another, including false values.
await new GroupController().updatePartialGroup({id:groupId,announce:true,desc:'antes'})
await new GroupController().updatePartialGroup({id:groupId,announce:false,desc:''})
assert.equal((await groups.getGroup(groupId))?.restricted,false)
assert.equal((await groups.getGroup(groupId))?.description,undefined)

// Permission regression: owner-only commands must not reach their handler.
const ownerOnly = Object.entries(registry).filter(([,c])=>c.permissions?.roles?.length===1&&c.permissions.roles[0]==='owner')
for (const [name] of ownerOnly) {
    const before=operations.length
    await commandInvoker(client,(await bots.getBot())!,message(name,[],{isBotOwner:false,isGroupAdmin:false,sender:member}),await groups.getGroup(groupId))
    const log=(await logsDb.getUserLogs(member,1))[0] as any
    assert.equal(log.success,0,`Permission bypass: ${name}`)
    assert(operations.slice(before).every(x=>x.kind==='send'),`Unauthorized side effect: ${name}`)
}
// Semantic routing must preserve source media and re-check authorization at confirmation.
process.env.SEMANTIC_COMMANDS_ENABLED='true'
const {SemanticCommandService}=await import('../src/services/semantic-command.service.js')
const {routeSemanticCommand,extractSemanticArguments,hasActivationSignal}=await import('../src/helpers/semantic-command.helper.js')
const decision=spyOn(SemanticCommandService.prototype,'classify').mockResolvedValue({command:'silenciar',confidence:0.99,candidates:{silenciar:0.99,none:0.01},stages:1,latencyMs:1})
const natural=(body:string,extra:any={})=>message('',[],{body,command:body.split(' ')[0],...extra})
const route=async(msg:any)=>routeSemanticCommand(client,bots.getBot(),msg,(await groups.getGroup(groupId))!)
assert.deepEqual(await route(natural('bot silencie esse membro',{mentioned:[member]})),{status:'handled',invoke:false})
assert.match(operations.at(-1)!.args[1].text,/confirmar/)
const beforeUnaddressed=operations.length
assert.deepEqual(await route(natural('cancelar')),{status:'not-applicable'})
assert.equal(operations.length,beforeUnaddressed)
assert.deepEqual(await route(natural('bot cancelar')),{status:'handled',invoke:false})
assert.match(operations.at(-1)!.args[1].text,/cancelada/)
await route(natural('bot silencie esse membro',{mentioned:[member]}))
const confirmed=natural('bot confirmar')
assert.deepEqual(await route(natural('confirmar')),{status:'not-applicable'})
assert.deepEqual(await route(confirmed),{status:'handled',invoke:true})
assert.equal(confirmed.command,'!silenciar')
await groups.setAdmin(groupId,moderator,true)
await route(natural('bot silencie esse membro',{sender:moderator,mentioned:[member],isBotOwner:false}))
await groups.setAdmin(groupId,moderator,false)
assert.deepEqual(await route(natural('bot confirmar',{sender:moderator,isBotOwner:false})),{status:'handled',invoke:false})
assert.match(operations.at(-1)!.args[1].text,/permissão/)
decision.mockRestore()
const spoken=natural('',{type:'audioMessage',semanticSource:'audio',semanticTranscript:'Bot. Transforma esta imagem em uma figurinha.',media:{seconds:5},isQuoted:true,quotedMessage:quote('imageMessage')})
assert.equal(hasActivationSignal(spoken,bots.getBot()),true)
assert.deepEqual(await route(spoken),{status:'handled',invoke:true})
assert.equal(spoken.command,'!s')
assert.equal(spoken.quotedMessage.type,'imageMessage')
assert.deepEqual(extractSemanticArguments('bot baixe https://example.com/video.mp4?x=1&y=2','d'),['https://example.com/video.mp4?x=1&y=2'])
// Supported pasted links are the only automatic exception to the wake word.
// Other natural requests and auto-sticker inputs still need activation.
const procs=await import('../src/helpers/message.procedures.helper.js')
const noopChecks=['isUserBlocked','isOwnerRegister','isBotLimitedByGroupRestricted','deleteMessageIfMutedMember','isUserLimitedByCommandRate','isCommandBlockedGlobally','isCommandBlockedGroup'] as const
const stubs=noopChecks.map(name=>spyOn(procs,name).mockResolvedValue(false as never))
for(const name of ['updateUserName','readUserMessage','incrementParticipantActivity','incrementUserCommandsCount','incrementGroupCommandsCount'] as const) stubs.push(spyOn(procs,name).mockResolvedValue(undefined) as any)
const {handlePrivateMessage,handleGroupMessage}=await import('../src/helpers/message.handler.helper.js')
const aiHelp = await import('../src/utils/ai.util.js')
const helpStub = spyOn(aiHelp, 'askGemini').mockResolvedValue('Consulte !menu.')
const legacyProtectionGroup = {
    ...(await groups.getGroup(groupId))!,
    welcome:{status:false,msg:''},
    antifake:{status:true,exceptions:{prefixes:['55'],numbers:[]}},
    antilink:{status:true,exceptions:[]},
    antiflood:{status:true,max_messages:1,interval:60},
    word_filter:['palavraqa'],
    blacklist:[] as string[],
}
// Simulate an already exceeded, still active counter from the retired anti-flood.
await db.prepare('UPDATE participants SET antiflood_msgs = 10, antiflood_expire = ? WHERE group_id = ? AND user_id = ?')
    .run(Math.floor(Date.now()/1000)+60,groupId,member)
for(const isGroupMsg of [true,false]){
    const runHandler=async(msg:any)=>isGroupMsg
        ? handleGroupMessage(client,{...legacyProtectionGroup,autosticker:true,auto_reply:{status:true,config:[{word:'regras',reply:'Resposta antiga que não deve ser enviada'}]}},bots.getBot(),msg)
        : handlePrivateMessage(client,{...bots.getBot(),commands_pv:true,autosticker:true},msg)
    // Saved configurations from the retired feature must no longer trigger replies.
    for (const extra of [
        {body:'regras',command:'regras'},
        {body:'quais são as regras',command:'quais'},
        {body:'',caption:'regras',type:'imageMessage',isMedia:true,media:{url:''}}
    ]) {
        const before = operations.length
        assert.equal(await runHandler(natural('',{isGroupMsg,...extra})),false)
        assert.equal(operations.length,before,'Retired automatic reply sent a message')
    }
    const beforeProtectionChecks = operations.length
    for (const text of ['palavraqa','https://example.com/test','mensagem repetida','mensagem repetida']) {
        assert.equal(await runHandler(natural(text,{
            isGroupMsg,sender:member,isBotOwner:false,isGroupAdmin:false,
        })),false)
    }
    assert.equal(operations.length,beforeProtectionChecks,'Retired filter deleted a message or removed a participant')
    assert.equal((await groups.getParticipant(groupId,member))?.antiflood.msgs,10,'Retired anti-flood updated its counter')
    const supportedLinks=[
        'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        'https://youtu.be/jNQXAC9IVRw',
        'https://www.instagram.com/reel/QATest/',
        'https://fb.watch/QATest/',
        'https://x.com/qa/status/123',
        'https://twitter.com/qa/status/123',
        'https://vm.tiktok.com/QATest/',
        'https://open.spotify.com/track/QATest',
        'https://br.pinterest.com/pin/123456/',
        'https://www.pinterest.com/pin/public-image--123456/',
        'https://pin.it/QATest',
    ]
    const autoClassifier=spyOn(SemanticCommandService.prototype,'classify').mockResolvedValue(null)
    for (const link of supportedLinks) {
        const linkMessage=natural(link,{isGroupMsg})
        assert.equal(await runHandler(linkMessage),true,link)
        assert.equal(linkMessage.command,'!d')
        assert.deepEqual(linkMessage.args,[link])
        assert.equal(linkMessage.text_command,link)
        assert.equal(linkMessage.isAutoDownload,true)
    }
    assert.equal(autoClassifier.mock.calls.length,0,'Pasted links must not depend on inference')
    autoClassifier.mockRestore()
    const link=supportedLinks[0]
    const caption=natural('',{caption:link,isGroupMsg,type:'imageMessage',isMedia:true,media:{url:''}})
    assert.equal(await runHandler(caption),true)
    assert.equal(caption.command,'!d')
    for (const [text,extra] of [
        [link,{isBotMessage:true}],
        ['https://youtube.com.example.org/watch?v=test',{}],
        ['https://example.org/?url=https://youtube.com/watch?v=test',{}],
        ['https://youtube.com@example.org/video',{}],
        ['https://pinterest.com.example.org/pin/123/',{}],
        ['https://www.pinterest.com/qa/board/',{}],
        ['mostre o menu',{}],
        ['Veja a mensagem citada',{isQuoted:true,quotedMessage:{...quote(),body:link}}],
        ['',{type:'audioMessage',semanticSource:'audio',semanticTranscript:link}],
    ] as const) {
        assert.equal(await runHandler(natural(text,{isGroupMsg,...extra})),false,text)
    }
    const manualAudio=message('play',[link],{isGroupMsg})
    assert.equal(await runHandler(manualAudio),true)
    assert.equal(manualAudio.command,'!play')
    assert.equal(manualAudio.isAutoDownload,undefined)
    const spokenAudio=natural(`Bot, baixe a música ${link}`,{isGroupMsg})
    assert.equal(await runHandler(spokenAudio),true)
    assert.equal(spokenAudio.command,'!play','Automatic download must not override an addressed audio request')
    assert.equal(await runHandler(natural('',{isGroupMsg,type:'imageMessage',isMedia:true,media:{url:''}})),false)
    assert.equal(await runHandler(message('menu',[],{isGroupMsg})),true)
    for (const name of REMOVED_COMMAND_NAMES) {
        assert.equal(await runHandler(message(name, [], {isGroupMsg})), false, `Removed command invoked through message handler: ${name}`)
    }
    const awake=natural('Bot, baixe o vídeo https://www.youtube.com/watch?v=jNQXAC9IVRw',{isGroupMsg})
    assert.equal(await runHandler(awake),true)
    assert.equal(awake.command,'!d')
}
// Old PV auto-sticker settings must not swallow ordinary requests about media.
const noIntent = spyOn(SemanticCommandService.prototype,'classify').mockResolvedValue(null)
for (const type of ['imageMessage','videoMessage']) {
    const msg = natural('bot veja esta mídia',{isGroupMsg:false,type,isMedia:true,media:{url:''}})
    const before = operations.length
    assert.equal(await handlePrivateMessage(client,{...bots.getBot(),commands_pv:true,autosticker:true},msg),false)
    assert.equal(operations.length,before+1)
    assert.match(operations.at(-1)!.args[1].text,/Não consegui identificar o comando/)
    assert.equal(msg.command,'bot','Retired PV auto-sticker rewrote the message')
}
noIntent.mockRestore()
const requestedSticker = natural('bot faça uma figurinha',{isGroupMsg:false,type:'imageMessage',isMedia:true,media:{url:''}})
assert.equal(await handlePrivateMessage(client,{...bots.getBot(),commands_pv:true,autosticker:true},requestedSticker),true)
assert.equal(requestedSticker.command,'!s','Explicit sticker requests must still work in PV')
helpStub.mockRestore()
for(const stub of stubs) stub.mockRestore()
// Use real permission/rate checks and the real invoker for automatic downloads;
// only network downloads and WhatsApp transport remain fixtures.
const autoLink='https://www.youtube.com/watch?v=jNQXAC9IVRw'
const automaticBot={...bots.getBot(),commands_pv:true}
const automaticGroup=(await groups.getGroup(groupId))!
const automaticMessage=(isGroupMsg:boolean)=>natural(autoLink,{
    sender:member,isGroupMsg,chat_id:isGroupMsg?groupId:member,isBotOwner:false,isGroupAdmin:false,
})
for(const isGroupMsg of [true,false]) {
    const msg=automaticMessage(isGroupMsg)
    const allowed=isGroupMsg
        ? await handleGroupMessage(client,automaticGroup,automaticBot,msg)
        : await handlePrivateMessage(client,automaticBot,msg)
    assert.equal(allowed,true)
    const before=operations.length
    await commandInvoker(client,automaticBot,msg,isGroupMsg?automaticGroup:null)
    assert(operations.slice(before).some(entry=>entry.kind==='send'&&entry.args[1].video),'Automatic link did not reach the download command')
    const log=(await logsDb.getUserLogs(member,1))[0]
    assert.equal(log.command,'d')
    assert.equal(log.success,1)
    const blockedBot={...automaticBot,block_cmds:['d']}
    assert.equal(isGroupMsg
        ? await handleGroupMessage(client,automaticGroup,blockedBot,automaticMessage(true))
        : await handlePrivateMessage(client,blockedBot,automaticMessage(false)),false)
}
assert.equal(await handleGroupMessage(client,{...automaticGroup,block_cmds:['d']},automaticBot,automaticMessage(true)),false)
assert.equal(await handlePrivateMessage(client,{...automaticBot,commands_pv:false},automaticMessage(false)),false)
await users.setLimitedUser(member,true,{...automaticBot,command_rate:{status:true,max_cmds_minute:1,block_time:60}},Math.floor(Date.now()/1000))
const rateLimited=automaticMessage(true)
assert.equal(await handleGroupMessage(client,automaticGroup,automaticBot,rateLimited),true)
const beforeRateLimit=operations.length
await commandInvoker(client,{...automaticBot,command_rate:{status:true,max_cmds_minute:1,block_time:60}},rateLimited,automaticGroup)
assert(!operations.slice(beforeRateLimit).some(entry=>entry.kind==='send'&&entry.args[1].video),'Automatic download bypassed the rate limit')
assert.equal((await logsDb.getUserLogs(member,1))[0].success,0)
// Persistent scheduler behavior is covered against PostgreSQL in qa-architecture.ts.
// Foreign numbers must be accepted on joins and startup even when old anti-fake
// options are enabled. Explicit blacklist enforcement must continue to work.
const {groupParticipantsUpdated}=await import('../src/events/group-participants-updated.event.js')
const {syncGroupsOnStart}=await import('../src/helpers/groups.sync.helper.js')
const foreignMember='351912345678@s.whatsapp.net'
const blacklistedMember='12025550199@s.whatsapp.net'
const legacyGroupStub=spyOn(GroupController.prototype,'getGroup').mockResolvedValue(legacyProtectionGroup)
let beforeMembership=operations.length
await groupParticipantsUpdated(client,{id:groupId,author:owner,participants:[foreignMember],action:'add'},bots.getBot())
assert.equal(await groups.isParticipant(groupId,foreignMember),true)
assert.equal(operations.length,beforeMembership,'Retired anti-fake rejected a foreign participant on join')
legacyProtectionGroup.blacklist.push(blacklistedMember)
await groupParticipantsUpdated(client,{id:groupId,author:owner,participants:[blacklistedMember],action:'add'},bots.getBot())
assert(operations.slice(beforeMembership).some(x=>x.kind==='participants'&&x.args[2]==='remove'&&x.args[1].includes(blacklistedMember)))
const syncStubs=[
    spyOn(wa,'getAllGroups').mockResolvedValue([metadata] as any),
    spyOn(GroupController.prototype,'syncGroups').mockResolvedValue(undefined as never),
    spyOn(GroupController.prototype,'getAllGroups').mockResolvedValue([legacyProtectionGroup]),
    spyOn(GroupController.prototype,'getParticipants').mockResolvedValue([
        {user_id:host,admin:true},{user_id:foreignMember,admin:false},{user_id:blacklistedMember,admin:false},
    ] as any),
]
beforeMembership=operations.length
assert.equal(await syncGroupsOnStart(client),true)
const syncRemovals=operations.slice(beforeMembership).filter(x=>x.kind==='participants'&&x.args[2]==='remove').flatMap(x=>x.args[1])
assert.deepEqual(syncRemovals,[],'Startup synchronizes metadata without moderation effects')
assert(!operations.slice(beforeMembership).some(x=>x.kind==='end'),'Startup synchronization failed')
for (const stub of syncStubs) stub.mockRestore()
legacyGroupStub.mockRestore()
const covered=new Set(report.map(row=>row.name))
const summary={sandbox,guides:Object.keys(registry).length,permissionChecks:ownerOnly.length,scenarios:report,untestedHandlers:Object.keys(registry).filter(name=>!covered.has(name))}
mkdirSync(path.join(root,'codex-scripts'),{recursive:true})
writeFileSync(path.join(root,'codex-scripts/core-command-qa.json'),JSON.stringify(summary,null,2))
console.log(JSON.stringify(summary,null,2))
if (report.some(row=>row.status==='fail')) throw new Error('Core command regression failed')
} finally {
    await testDatabase.close()
}

process.exit(0)
