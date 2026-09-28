import * as groupFunctions from './group.functions.commands.js'

const groupCommands = {
    silenciar:{
        semantic: {
            description: 'Alternar silêncio de um membro do grupo.',
            examples: ['silencia o membro', 'muta a pessoa', 'faz parar de falar', 'tira o membro do mute', 'dessilencia']
        },
        guide: `Ex: Responda alguém com *{$p}silenciar* - Alterna o silêncio do membro respondido.\n`+
        `Ex: Marque alguém com *{$p}silenciar* - Alterna o silêncio do membro marcado.\n\n`+
        `*Obs*: Use novamente para desmutar o membro.\n`,
        msgs: {
            reply_muted: '🔇 Mutado\n\n'+
            '@{$1} foi mutado pelo administrador.',
            reply_unmuted: '🔈 Desmutado\n\n'+
            '@{$1} voltou a poder falar no grupo.',
            error_missing_target: 'É necessário marcar ou responder alguém para silenciar.',
            error_silence_bot: 'O bot não pode ser silenciado.',
            error_silence_admin: 'Não é possível silenciar um administrador do grupo.'
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.silenciarCommand
    },
    addlista: {
        guide: `Ex: Responda alguém com *{$p}addlista* - Adiciona o numero de quem foi respondido a lista negra e bane em seguida.\n\n`+
        `Ex: Marque alguém com *{$p}addlista* - Adiciona o numero de quem foi marcado a lista negra e bane em seguida.\n\n`+
        `Ex: *{$p}addlista* +55219xxxx-xxxx - Adiciona o número digitado a lista negra do grupo e bane em seguida.\n.`,
        msgs: {
            reply: "✅ O número desse usuário foi adicionado á lista negra e será banido do grupo caso ainda esteja aqui.",
            error_add_bot: "O *bot* não pode ser adicionado a lista negra.",
            error_add_admin: "O *administrador do grupo* não pode ser adicionado a lista negra.",
            error_already_listed: "Este usuário já está na lista negra.",
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.addlistaCommand
    },
    rmlista: {
        guide: `Ex: Digite *{$p}rmlista 1* - Remove o usuário selecionado da lista negra.\n\n`+
        `*Obs*: Para ver o ID dos usuários é necessário checar no comando *{$p}listanegra*\n\n`+
        `Você também pode remover da lista negra da seguinte forma: \n\n`+
        `Ex: *{$p}rmlista* +55219xxxx-xxxx - Remove o número digitado da lista negra do grupo.\n`,
        msgs: {
            reply: "✅ O número desse usuário foi removido da lista negra.",
            error_not_listed: "Este usuário não está na lista negra.",
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.rmlistaCommand
    },
    listanegra: {
        guide: `Ex: *{$p}listanegra* - Exibe a lista negra do grupo.\n`,
        msgs: {
            error_empty_list: "Não existem usuários na lista negra deste grupo.",
            reply_title: "❌ *Lista negra*\n\n"+
            "*Usuários na lista negra*: {$1}\n\n",
            reply_item: '- *ID*: {$1}\n'+
            '- *Nome*: {$2}\n'+
            '- *Contato*: +{$3}\n\n'
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.listanegraCommand
    },
    add: {
        guide: `Ex: *{$p}add* +55219xxxx-xxxx - Digite o numero com o código do país para adicionar a pessoa.\n\n`+
        `Ex: *{$p}add* +55219xxxx-xxxx, +55119xxxx-xxxx - Digite os numeros com o código do país (adiciona mais de uma pessoa no grupo).\n`,
        msgs: {
            reply: '✅ O número +{$1} foi adicionado ao grupo com sucesso.',
            error_add: "O número +{$1} não pode ser adicionado. Provavelmente está com privacidade ativada, já está no grupo ou o grupo não aceita mais membros.",
            error_input: "Foi encontrado texto no número inserido, digite corretamente o número de quem você deseja adicionar ao grupo.",
            error_invalid_number: "Houve um erro em adicionar o número +{$1}, verifique se o número existe ou tente tirar o 9.",
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.addCommand
    },
    ban: {
        semantic: {
            description: 'Remover ou expulsar membro não administrador deste grupo.',
            examples: ['remove o membro do grupo', 'expulsa a pessoa', 'tira esse membro daqui', 'bane o participante']
        },
        guide: `Ex: *{$p}ban* @membro - Para banir um membro marcando ele.\n\n`+
        `Ex: Responder alguém com *{$p}ban* - Bane o membro que você respondeu.\n`,
        msgs: {
            reply_title: '🚷 *Banimento de membros*\n\n',
            reply_item_success: "+{$1} foi banido do grupo com sucesso.\n",
            reply_item_ban_admin: "+{$1} não pode ser banido, o bot não pode banir um administrador.\n",
            reply_item_not_found: "+{$1} não pode ser banido, provavelmente ele já saiu do grupo.\n",
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.banCommand
    },
    promover: {
        semantic: {
            description: 'Promover membro a administrador deste grupo.',
            examples: ['promove o membro pra admin', 'torna a pessoa administradora', 'dá admin para o participante']
        },
        guide: `Ex: *{$p}promover* @membro - Promove o membro mencionado a *administrador*.\n\n`+
        `Ex: Responder com *{$p}promover* - Promove o usuário respondido a *administrador*.\n`,
        msgs: {
            error: "O bot não pode ser promovido por ele mesmo.",
            reply_title: "⬆️ *Promover membros*\n\n",
            reply_item_success: "@{$1} foi promovido para *ADMINISTRADOR*.\n",
            reply_item_error: "@{$1} já é um *ADMINISTRADOR*.\n",
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.promoverCommand
    },
    rebaixar: {
        semantic: {
            description: 'Remover privilégios de administrador de um membro.',
            examples: ['rebaixa o admin', 'tira ele de admin', 'remove o cargo de administrador']
        },
        guide: `Ex: *{$p}rebaixar* @admin - Rebaixa o administrador mencionado a *membro*.\n\n`+
        `Ex: Responder com *{$p}rebaixar* - Rebaixa o administrador respondido a *membro*.\n`,
        msgs: {
            error: "O bot não pode ser rebaixado por ele mesmo.",
            reply_title: "⬇️ *Rebaixar membros*\n\n",
            reply_item_success: "@{$1} foi rebaixado para *MEMBRO*.\n",
            reply_item_error_is_member: "@{$1} já é um *MEMBRO*.\n",
            reply_item_error: "@{$1} não pode ser rebaixado.\n"
        },
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.rebaixarCommand
    },
    apg: {
        guide: `Ex: Responder com *{$p}apg* - Apaga a mensagem que foi respondida com esse comando.\n\n`+
        `*Obs*: O bot precisa ser administrador.\n`,
        permissions: {roles: ['owner', 'group_moderator']},
        function: groupFunctions.apgCommand
    },
}

export default groupCommands
