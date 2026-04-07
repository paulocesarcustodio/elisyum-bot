import infoCommands from '../src/commands/info.list.commands.js'
import utilityCommands from '../src/commands/utility.list.commands.js'
import groupCommands from '../src/commands/group.list.commands.js'
import adminCommands from '../src/commands/admin.list.commands.js'
import { Commands } from '../src/interfaces/command.interface.js'
import fs from 'node:fs'
import path from 'node:path'

// Mapeamento de comandos para documentação em linguagem natural
const commandDocs: Record<string, { title: string; content: string; keywords: string }> = {
    // DOWNLOAD
    d: {
        title: "COMO BAIXAR VÍDEOS, ÁUDIOS E IMAGENS",
        content: `Se você quer baixar vídeo, áudio ou imagem de redes sociais, basta enviar o link suportado no chat.

Funciona com:
• YouTube - vídeos, shorts, músicas
• Instagram - reels, posts, stories
• TikTok - vídeos
• Facebook - vídeos
• Twitter/X - vídeos e GIFs

Como usar:
• Envie o link direto - o bot detecta e baixa automaticamente
• *!d* seguido do link - continua funcionando como atalho manual
• Responder uma mensagem que tenha link com *!d*
• *!d* seguido do título para buscar no YouTube - exemplo: !d nome da música

O bot identifica automaticamente a plataforma e baixa o melhor formato disponível.`,
        keywords: "baixar vídeo, download vídeo, pegar vídeo, salvar vídeo, fazer download, youtube, instagram, tiktok, facebook, twitter, mídia, reel, story, shorts"
    },
    
    play: {
        title: "COMO BAIXAR MÚSICA/ÁUDIO DO YOUTUBE",
    content: `Para baixar apenas o áudio de vídeos do YouTube (música), use *!p*

Como usar:
• *!p* seguido do nome da música - exemplo: !p imagine dragons
• *!p* com link do YouTube - exemplo: !p https://youtube.com/watch?v=...
• Responder mensagem com link do YouTube e digitar *!p*
• *!play* continua funcionando por compatibilidade

O bot vai buscar a música no YouTube, baixar e enviar como áudio. O vídeo pode ter no máximo 9 minutos.

Diferença do auto-download: o *!p* só funciona com YouTube e envia como áudio.`,
    keywords: "música, musica, audio, áudio, som, mp3, baixar música, download música, play, p, youtube música, canção"
    },

    mp3: {
    title: "COMO CONVERTER VÍDEO EM MP3",
    content: `Para transformar vídeos em áudio, use *!mp3*

Como usar:
• *!mp3* seguido do nome da música - busca no YouTube
• *!mp3* com link suportado - converte o vídeo em áudio
• Responder um link com *!mp3*
• Responder um vídeo enviado no WhatsApp com *!mp3*

O comando baixa o vídeo quando necessário e envia apenas o áudio em MP3.`,
    keywords: "mp3, converter video em audio, extrair audio, tirar audio do video, converter video, musica, audio"
    },
    
    img: {
        title: "COMO BUSCAR IMAGENS",
        content: `Para buscar imagens sobre qualquer tema, use *!img*

Como usar:
• *!img* seguido do tema - exemplo: !img gato fofo

O bot vai buscar e enviar 2 imagens relacionadas ao tema que você pediu.`,
        keywords: "imagem, foto, picture, buscar imagem, pesquisar imagem, procurar imagem"
    },
    
    // STICKER
    s: {
        title: "COMO CRIAR FIGURINHAS (STICKERS)",
        content: `Para transformar imagens, vídeos ou textos em figurinha, use *!s*

Formas de usar:
• Enviar ou responder uma IMAGEM/VÍDEO com *!s* - cria figurinha normal
• Responder uma MENSAGEM DE TEXTO com *!s* - cria figurinha estilo WhatsApp (texto em fundo branco)
• Usar *!s 1* com imagem - cria figurinha CIRCULAR (recorta círculo)
• Usar *!s 2* com imagem - cria figurinha mantendo PROPORÇÃO original

Exemplos:
• Mandar uma foto e escrever !s
• Responder mensagem "oi sumido" com !s para criar figurinha de texto
• Mandar imagem e escrever !s 1 para figurinha redonda

Vídeos viram GIF animado (máximo 8 segundos).`,
        keywords: "figurinha, sticker, criar figurinha, fazer figurinha, transformar em figurinha, gif, gif animado, sticker redondo, sticker circular, figurinha de texto"
    },
    
    simg: {
        title: "COMO TRANSFORMAR FIGURINHA EM IMAGEM",
        content: `Para converter uma figurinha em imagem normal, use *!simg*

Como usar:
• Responder uma figurinha com *!simg*

ATENÇÃO: Só funciona com figurinhas NÃO ANIMADAS (estáticas).`,
        keywords: "figurinha para imagem, sticker para foto, converter figurinha, transformar figurinha em foto"
    },
    
    // ÁUDIO
    save: {
        title: "COMO SALVAR ÁUDIO/MEME DE VOZ",
        content: `Para salvar um áudio e poder reproduzir depois com comando, use *!save*

Como usar:
• Responder um ÁUDIO com *!save nome-do-audio*

Exemplo: responder áudio do "eita" com !save eita

O áudio fica salvo GLOBALMENTE - todos do grupo podem usar!
Depois use *!a eita* para reproduzir.`,
        keywords: "salvar áudio, salvar audio, gravar áudio, guardar áudio, meme de áudio, meme de voz, salvar som"
    },
    
    audio: {
        title: "COMO REPRODUZIR ÁUDIO SALVO",
    content: `Para reproduzir um áudio que foi salvo, use *!a*

Como usar:
• *!a nome-do-audio* - exemplo: !a eita
• *!a* sem parâmetro - mostra a lista de áudios
• Responder uma mensagem com *!a nome-do-audio* - reproduz como resposta
• *!audio* continua funcionando por compatibilidade

Para ver todos os áudios disponíveis, use *!a* ou *!audios*`,
    keywords: "tocar áudio, reproduzir áudio, meme de áudio, som salvo, áudio salvo, voice, voz, a"
    },
    
    audios: {
        title: "COMO VER LISTA DE ÁUDIOS SALVOS",
    content: `Para ver todos os áudios disponíveis, use *!a* ou *!audios*

Como usar:
• *!a* - mostra a primeira página
• *!audios* - mostra primeira página
• *!audios 2* - mostra página 2

A lista mostra todos os áudios salvos que podem ser usados com !a`,
        keywords: "lista de áudios, ver áudios, áudios disponíveis, listar áudios, memes de áudio"
    },
    
    delete: {
        title: "COMO DELETAR ÁUDIO SALVO",
        content: `Para deletar permanentemente um áudio que você criou, use *!delete*

Como usar:
• *!delete nome-do-audio* - exemplo: !delete eita

ATENÇÃO: Só o criador do áudio pode deletar! Esta ação não pode ser desfeita!`,
        keywords: "deletar áudio, apagar áudio, remover áudio, excluir áudio"
    },
    
    rename: {
        title: "COMO RENOMEAR ÁUDIO SALVO",
        content: `Para mudar o nome de um áudio que você criou, use *!rename*

Como usar:
• *!rename nome-antigo | nome-novo*

Exemplo: !rename eita | eita-preula

Use o símbolo *|* para separar o nome antigo do novo.
ATENÇÃO: Só o criador pode renomear!`,
        keywords: "renomear áudio, mudar nome áudio, trocar nome áudio"
    },
    
    // UTILIDADE
    revelar: {
        title: "COMO REVELAR FOTO/VÍDEO DE VISUALIZAÇÃO ÚNICA",
        content: `Para ver foto ou vídeo de visualização única (view once) sem limite, use *!revelar*

Como usar:
• Responder a mensagem de visualização única com *!revelar*

O bot vai revelar o conteúdo e enviar para você ver quantas vezes quiser.`,
        keywords: "revelar view once, ver visualização única, foto visualização única, view once"
    },
    
    // INFORMAÇÃO
    menu: {
        title: "COMO VER O MENU DE COMANDOS",
        content: `Para ver todos os comandos disponíveis, use *!menu*

Como usar:
• Digite *!menu*

Mostra a lista completa de comandos que você pode usar.`,
        keywords: "menu, comandos, ajuda, help, lista de comandos"
    },
    
    ask: {
        title: "COMO PERGUNTAR SOBRE COMANDOS",
        content: `Para tirar dúvidas sobre comandos do bot usando IA, use *!ask*

Como usar:
• *!ask* seguido da sua pergunta

Exemplos:
• !ask como baixar vídeo?
• !ask como criar figurinha?
• !ask qual comando salva áudio?

O bot usa inteligência artificial para te ajudar!`,
        keywords: "perguntar, ajuda, dúvida, como usar, explicar comando, ia, inteligência artificial"
    },
    
    info: {
        title: "COMO VER INFORMAÇÕES DO BOT",
        content: `Para ver informações completas e configurações do bot, use *!info*

Mostra versão, estatísticas e configurações atuais.`,
        keywords: "informações, info, sobre o bot, versão, configurações"
    },
    
    meusdados: {
        title: "COMO VER SEUS DADOS E ESTATÍSTICAS",
        content: `Para ver suas estatísticas e dados no bot, use *!meusdados*

Mostra quantos comandos você executou, mensagens enviadas, tipo de usuário, etc.`,
        keywords: "meus dados, minhas estatísticas, meu perfil, estatísticas"
    }
}

function generateAIFriendlyDocs() {
    // Documentação para usuários
    let userContent = `GUIA COMPLETO DE COMANDOS DO BOT ELISYUM
Este documento foi criado para ajudar você a encontrar o comando certo para o que você precisa.

═══════════════════════════════════════════════════════════════════

`

    // Documentação para admins de grupo (comandos de usuário + comandos de grupo)
    let groupAdminContent = userContent
    
    // Documentação para dono do bot (tudo + comandos de administração do bot)
    let botOwnerContent = userContent

    // Adicionar comandos de usuário
    const userCommandNames = ['d', 'play', 'mp3', 'img', 's', 'simg', 'save', 'audio', 'audios', 'delete', 'rename', 'revelar', 'menu', 'ask', 'info', 'meusdados']
    
    for (const cmdName of userCommandNames) {
        if (commandDocs[cmdName]) {
            const doc = commandDocs[cmdName]
            userContent += `${doc.title}
${'─'.repeat(70)}

${doc.content}

🔍 Palavras-chave: ${doc.keywords}

═══════════════════════════════════════════════════════════════════

`
        }
    }
    
    // Admins de grupo têm acesso aos comandos de usuário + comandos de grupo
    groupAdminContent = userContent
    
    // Adicionar seção de comandos de grupo
    groupAdminContent += `

🔐 COMANDOS DE ADMINISTRAÇÃO DE GRUPOS
Os comandos abaixo são exclusivos para administradores de grupos.

═══════════════════════════════════════════════════════════════════

GERENCIAR MEMBROS DO GRUPO

Para adicionar pessoas: *!add* número (ou responder mensagem)
Para remover/banir: *!ban* @mencionar ou responder mensagem
Para promover a admin: *!promover* @mencionar ou responder mensagem  
Para remover admin: *!rebaixar* @mencionar ou responder mensagem

🔍 Palavras-chave: adicionar membro, remover membro, kick, ban, banir, expulsar, promover admin, rebaixar admin, tirar admin, moderador

═══════════════════════════════════════════════════════════════════

SILENCIAR E CONTROLAR MEMBROS

Para silenciar uma PESSOA específica (impedir de falar no grupo):
• *!silenciar* @mencionar ou responder mensagem
• Use novamente para desmutar a pessoa

Para dar avisos/advertências:
• *!aviso* @mencionar - adiciona aviso
• *!rmaviso* @mencionar - remove aviso
• *!zeraravisos* @mencionar - zera todos avisos

🔍 Palavras-chave: silenciar, mutar pessoa, calar, impedir falar, avisos, advertir, advertência, warning

═══════════════════════════════════════════════════════════════════

CONFIGURAR GRUPO

Para mudar foto do grupo: Enviar imagem com *!fotogrupo*
Para fechar grupo (só admins falam): *!restrito* (ativa/desativa)
Para ver link do grupo: *!link*
Para resetar link: *!rlink*

Para desabilitar comandos do bot para membros: *!mutar* (só admins usam comandos)
Para ativar/desativar bem-vindo: *!bemvindo*
Para ativar/desativar anti-link: *!antilink*
Para ativar/desativar anti-fake: *!antifake*
Para ativar/desativar anti-flood: *!antiflood*
Para ativar/desativar auto-sticker: *!autosticker*

🔍 Palavras-chave: configurar grupo, fechar grupo, abrir grupo, restringir grupo, bem vindo, bemvindo, antilink, antifake, antiflood, foto grupo, link grupo, mutar comandos, desabilitar comandos

═══════════════════════════════════════════════════════════════════

MARCAR E MENCIONAR

Para marcar TODOS (membros + admins): *!mt* mensagem
Para marcar só MEMBROS: *!mm* mensagem
Para marcar só ADMINS: *!adms* mensagem

🔍 Palavras-chave: marcar todos, mencionar todos, everyone, marcar membros, marcar admins, mencionar admins

═══════════════════════════════════════════════════════════════════

OUTROS COMANDOS DE GRUPO

Para ver dados do grupo: *!grupo*
Para ver quem é dono: *!dono*
Para apagar mensagem: *!apg* (respondendo mensagem)
Para ver membros ativos: *!topativos*
Para ver inativos: *!inativos*
Para ver dados de membro: *!membro* @mencionar

Para bloquear comandos: *!bcmd* comando1,comando2
Para desbloquear: *!dcmd* comando1,comando2

🔍 Palavras-chave: info grupo, informações grupo, dados grupo, dono grupo, apagar mensagem, deletar mensagem, membros ativos, ranking, inativos, bloquear comando

`

    // Dono do bot tem tudo: comandos de usuário + grupo + administração do bot
    botOwnerContent = groupAdminContent + `

👑 COMANDOS EXCLUSIVOS DO DONO DO BOT
Os comandos abaixo só podem ser usados pelo dono do bot.

═══════════════════════════════════════════════════════════════════

ADMINISTRAÇÃO DO BOT

Para bloquear contatos globalmente: *!block* @mencionar
Para desbloquear: *!unblock* @mencionar
Para ver bloqueados: *!blockedlist*

Para sair de um grupo: *!sairgrupo* (no grupo)
Para entrar em grupo: *!entrargrupo* link

Para atualizar o bot: *!update*
Para reiniciar: *!reboot*

🔍 Palavras-chave: bloquear contato, desbloquear, lista de bloqueados, sair grupo, entrar grupo, atualizar bot, reiniciar bot, administração bot

`

    // Criar diretório
    const docsDir = path.join(process.cwd(), 'docs', 'commands')
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true })
    }
    
    // Escrever 3 arquivos
    fs.writeFileSync(path.join(docsDir, 'ai-friendly-usuario.txt'), userContent, 'utf-8')
    fs.writeFileSync(path.join(docsDir, 'ai-friendly-groupadmin.txt'), groupAdminContent, 'utf-8')
    fs.writeFileSync(path.join(docsDir, 'ai-friendly-owner.txt'), botOwnerContent, 'utf-8')
    
    console.log('✅ Documentação AI-friendly gerada com sucesso!')
    console.log(`📄 Arquivo para usuários: ai-friendly-usuario.txt (${userCommandNames.length} comandos)`)
    console.log(`📄 Arquivo para admins de grupo: ai-friendly-groupadmin.txt (usuário + comandos de grupo)`)
    console.log(`📄 Arquivo para dono do bot: ai-friendly-owner.txt (tudo + administração do bot)`)
    console.log(`📁 Salvos em: ${docsDir}`)
}

generateAIFriendlyDocs()
