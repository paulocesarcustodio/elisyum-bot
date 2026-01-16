export interface Bot {
    started: number,
    host_number: string,
    name: string,
    prefix: string,
    executed_cmds: number,
    db_migrated: boolean,
    db_migration_version?: number,
    autosticker: boolean,
    block_cmds: string[],
    commands_pv: boolean,
    command_rate:{
        status: boolean,
        max_cmds_minute: number,
        block_time: number,
    }
}