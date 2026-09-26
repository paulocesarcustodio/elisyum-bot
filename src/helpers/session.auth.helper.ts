import { db } from "../database/db.js";
import { AuthenticationCreds, AuthenticationState, initAuthCreds, SignalDataTypeMap, BufferJSON, proto } from "@whiskeysockets/baileys";

const getStmt = db.prepare('SELECT data FROM session_store WHERE key = ?');
const upsertStmt = db.prepare('INSERT OR REPLACE INTO session_store (key, data) VALUES (?, ?)');
const deleteStmt = db.prepare('DELETE FROM session_store WHERE key = ?');

const read = (key: string) => {
    const result = getStmt.get(key) as { data: string } | undefined;
    return result ? JSON.parse(result.data, BufferJSON.reviver) : null;
};

export async function useSQLiteAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
    const creds: AuthenticationCreds = read("creds") || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
                    const data: { [_: string]: SignalDataTypeMap[T] } = {};
                    for (const id of ids) {
                        let value = read(`${type}-${id}`);
                        if (type === "app-state-sync-key" && value) {
                            value = proto.Message.AppStateSyncKeyData.create(value as proto.Message.IAppStateSyncKeyData);
                        }
                        if (value !== null && value !== undefined) {
                            data[id] = value as SignalDataTypeMap[T];
                        }
                    }
                    return data;
                },
                set: async (data: { [T in keyof SignalDataTypeMap]?: { [id: string]: SignalDataTypeMap[T] | null | undefined } }) => {
                    db.run('BEGIN IMMEDIATE');
                    try {
                        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
                            const entries = data[category];
                            if (!entries) continue;
                            for (const id of Object.keys(entries)) {
                                const value = entries[id];
                                const key = `${category}-${id}`;
                                if (value === null || value === undefined) {
                                    deleteStmt.run(key);
                                } else {
                                    upsertStmt.run(key, JSON.stringify(value, BufferJSON.replacer));
                                }
                            }
                        }
                        db.run('COMMIT');
                    } catch (e) {
                        db.run('ROLLBACK');
                        throw e;
                    }
                },
            },
        },
        saveCreds: async () => {
            if (!creds?.noiseKey?.private) return;
            upsertStmt.run("creds", JSON.stringify(creds, BufferJSON.replacer));
        },
    };
}

export async function cleanCreds(){
    db.prepare('DELETE FROM session_store').run()
}

export async function waitForAuthPersistence(): Promise<void> {
    // SQLite writes are synchronous, no need to wait
}
