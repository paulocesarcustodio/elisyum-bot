import * as adminFunctions from './admin.functions.commands.js'

const adminCommands = {
    admin: {
        semantic: { description: '', examples: [], naturalCommand: false },
        guide: `Ex: *{$p}admin* - Exibe o menu de administração do bot.\n`,
        permissions: { roles: ['owner'] },
        function: adminFunctions.adminCommand
    },
    comandospv: {
        guide: `Ex: *{$p}comandospv* - Liga/desliga os comandos em MENSAGENS PRIVADAS.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            reply_off: "✅ Os *COMANDOS EM MENSAGENS PRIVADAS* foram desativados com sucesso.",
            reply_on: "✅ Os *COMANDOS EM MENSAGENS PRIVADAS* foram ativados com sucesso."
        },
        function: adminFunctions.comandospvCommand
    },
    taxacomandos: {
        guide: `Ex: *{$p}taxacomandos* 5 - Ativa a taxa limite de comandos para 5 comandos a cada minuto por usuário, com 60 segundos de bloqueio.\n`+
        `Ex: *{$p}taxacomandos* 10 80 - Ativa a taxa limite de comandos para 10 comandos a cada minuto por usuário, com 80 segundos de bloqueio.\n\n`+
        `*Obs*: Digite *{$p}taxacomandos* novamente para desativar a taxa limite de comandos.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            error_max_commands_invalid: "A quantidade máxima de comandos por minuto está inválida, precisa ser um número e ser maior que 3.",
            error_block_time_invalid: "O tempo de bloqueio de mensagens está inválido, precisa ser um número e maior que 10.",
            reply_on: "✅ A *TAXA DE COMANDOS POR MINUTO* foi ativada com sucesso.\n\n"+
            '*Configuração atual*: \n'+
            '- *Comandos por minuto*: {$1}\n'+
            '- *Tempo de bloqueio*: {$2}s\n',
            reply_off: "✅ A *TAXA DE COMANDOS POR MINUTO* foi desativada com sucesso.",
        },
        function: adminFunctions.taxacomandosCommand
    },
    listablock: {
        guide: `Ex: *{$p}listablock* - Exibe a lista de usuários bloqueados pelo bot.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            reply_title: "🚷 *Usuários bloqueados* \n\n"+
            "*Total*: {$1}\n\n",
            reply_item: "- *ID*: {$1}\n"+
            "- *Contato*: +{$2}\n\n",
            error: "O bot não tem usuários bloqueados.",
        },
        function: adminFunctions.listablockCommand
    },
    bloquear: {
        guide: `Ex: *{$p}bloquear* @membro - Para o bot bloquear o membro mencionado.\n\n`+
        `Ex: *{$p}bloquear* +55 (xx) xxxxx-xxxx - Para o bot bloquear o número digitado.\n\n`+
        `Ex: Responder alguém com *{$p}bloquear* - Para o bot bloquear o membro que você respondeu.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            error_block_admin_bot: "O usuário +{$1} é *dono* do bot, não foi possivel bloquear.",
            error_already_blocked: "O usuário +{$1} já está *bloqueado*.",
            error_block: "Houve um erro ao bloquear este usuário, verifique se o número inserido existe e está correto.",
            reply: "✅ O usuário +{$1} foi *bloqueado* com sucesso"
        },
        function: adminFunctions.bloquearCommand
    },
    desbloquear: {
        guide: `Ex: Digite *{$p}desbloquear 1* - Desbloqueia o usuário selecionado da lista negra.\n\n`+
        `*Obs*: Para ver o ID dos usuários é necessário checar no comando *{$p}listablock*\n\n`+
        `Você também pode desbloquear usuários das seguintes formas: \n\n`+
        `Ex: *{$p}desbloquear* @membro - Para o bot desbloquear o membro mencionado.\n\n`+
        `Ex: *{$p}desbloquear* +55 (xx) xxxxx-xxxx - Para o bot desbloquear o número digitado.\n\n`+
        `Ex: Responder alguém com *{$p}desbloquear* - Para o bot desbloquear o usuário que você respondeu.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            error_already_unblocked: "O usuário +{$1} já está *desbloqueado* ou nunca foi bloqueado.",
            error_unblock: "Houve um erro ao desbloquear este usuário, verifique se o número está correto e que ele realmente está bloqueado.",
            reply: "✅ O usuário +{$1} foi *desbloqueado* com sucesso."
        },
        function: adminFunctions.desbloquearCommand
    },
    usuario: {
        guide: `Ex: *{$p}usuario* @usuario - Mostra os dados gerais do usuário mencionado.\n\n`+
        `Ex: Responder com *{$p}usuario* - Mostra os dados gerais do usuário respondido.\n\n`+
        `Ex: *{$p}usuario* 55219xxxxxxxx - Mostra os dados gerais do usuário com esse número.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            error_user_not_found: "Este usuário ainda não está registrado, faça ele interagir com o bot primeiro.",
            reply: "👤 *Dados do usuário*\n\n"+
            "*Nome*: {$1}\n"+
            "*Tipo de usuário*: {$2}\n"+
            "*Número*: +{$3}\n"+
            "*Total de comandos usados*: {$4} comandos"
        },
        function: adminFunctions.usuarioCommand
    },
    ping: {
        guide: `Ex: *{$p}ping* - Exibe as informações do sistema do BOT e o tempo de resposta dele.\n`,
        permissions: { roles: ['owner'] },
        msgs: {
            reply: "🖥️ *Informação geral*\n\n"+
            "*OS*: {$1}\n"+
            "*CPU*: {$2}\n"+
            "*RAM*: {$3}GB/{$4}GB\n"+
            "*Resposta*: {$5}s\n"+
            "*Usuários cadastrados*: {$6}\n"+
            "*Grupos cadastrados*: {$7}\n"+
            "*Online desde*: {$8}"
        },
        function: adminFunctions.pingCommand
    },
}

export default adminCommands
