export interface User {
    id : string,
    name? : string|null,
    commands: number,
    receivedWelcome: boolean,
    owner : boolean,
    command_rate: UserCommandRate,
    helpLevel?: 'simple' | 'detailed' | 'with-ai'
}

export interface UserCommandRate {
    limited: boolean,
    expire_limited: number,
    cmds : number,
    expire_cmds : number
}

