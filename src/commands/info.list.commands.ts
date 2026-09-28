import * as infoFunctions from "./info.functions.commands.js"

const infoCommands = {
    menu: {
        guide: `Ex: *{$p}menu* - Exibe o menu de comandos gerais.\n`,
        msgs: {
            reply: "Olá, *{$1}*\n"+
            "Tipo de Usuário: *{$2}*\n"+
            "Comandos feitos: *{$3}*\n"+
            '────────────────────────\n',
            error_user_not_found: "Usuário não foi encontrado no banco de dados.",
            error_invalid_option: "A opção selecionada não existe no menu.",
        },
        function: infoFunctions.menuCommand
    }
}

export default infoCommands
