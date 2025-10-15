import DataStore from "@seald-io/nedb";
import { AuthenticationCreds, AuthenticationState, initAuthCreds, WAProto, SignalDataTypeMap, BufferJSON } from "@whiskeysockets/baileys"

const db = new DataStore<{key: string, data: string}>({filename : './storage/session.db', autoload: true})

export async function useNeDBAuthState() : Promise<{ state: AuthenticationState, saveCreds: () => Promise<void>}> {
    const write = async (data: any, key: string) => {
        await db.updateAsync({key}, { $set: { data: JSON.stringify(data, BufferJSON.replacer) }}, {upsert: true})
    }

    const read = async (key: string) => {
        const result = await db.findOneAsync({key})
        return result ? JSON.parse(result.data, BufferJSON.reviver) : null
    }

    const remove = async (key: string) => {
        await db.removeAsync({ key }, {multi: false})
    }

    const creds: AuthenticationCreds = await read("creds") || initAuthCreds()

    return {
        state: {
            creds,
            keys: {
                get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
                    const data: { [_: string]: SignalDataTypeMap[T] } = {}
                    await Promise.all(
                        ids.map(async (id: string) => {
                            let value = await read(`${type}-${id}`)

                            if (type === "app-state-sync-key" && value) {
                                value = WAProto.Message.AppStateSyncKeyData.create(value as WAProto.Message.IAppStateSyncKeyData)
                            }

                            data[id] = value as SignalDataTypeMap[T]
                        })
                    )

                    return data
                },
                set: async (
                    data: {
                        [T in keyof SignalDataTypeMap]?: {
                            [id: string]: SignalDataTypeMap[T] | null | undefined
                        }
                    }
                ) => {
                    const tasks: Promise<void>[] = [];
                    for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
                        const entries = data[category]
                        if (!entries) continue

                        for (const id of Object.keys(entries)) {
                            const value = entries[id]
                            const key = `${category}-${id}`
                            tasks.push(value ? write(value, key) : remove(key))
                        }
                    }
                    await Promise.all(tasks)
                }
            }
        },
        saveCreds: async () => {
            await write(creds, "creds")
        }
    }
}

export async function cleanCreds(){
    await db.removeAsync({}, {multi: true})
}