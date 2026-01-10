import * as miscFunctions from './misc.functions.commands.js'

const miscCommands = {
    vtnc: {
        guide: `Ex: *{$p}vtnc* @membro - Manda o ASCII desejado pro membro mencionado.\n\n`+
        `Ex: Responder com *{$p}vtnc* - Manda o ASCII desejado para o membro respondido.\n`,
        msgs: {
            error_mention: "Apenas um membro deve ser marcado por vez.",
            error_message: "Houve um erro ao obter os dados da mensagem.",
            reply: '@{$1} vai tomar no cu!\n\n{$2}'
        },
        function: miscFunctions.vtncCommand
    }
}

export default miscCommands