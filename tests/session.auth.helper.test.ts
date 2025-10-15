import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { proto } from "@whiskeysockets/baileys";
import { useNeDBAuthState, cleanCreds } from "../src/helpers/session.auth.helper.ts";

const storageDir = path.resolve(process.cwd(), "storage");

test("persists and clears new signal key types", async () => {
    await fs.mkdir(storageDir, { recursive: true });
    await cleanCreds();

    const { state } = await useNeDBAuthState();

    const senderKeyMemory = { "123@g.us": true };
    const deviceList = ["device-1", "device-2"];
    const appStateKey = proto.Message.AppStateSyncKeyData.create({
        keyId: "abc",
        keyData: new Uint8Array([1, 2, 3]),
    });

    await state.keys.set({
        "sender-key-memory": {
            "group-1": senderKeyMemory,
        },
        "device-list": {
            "123@s.whatsapp.net": deviceList,
        },
        "app-state-sync-key": {
            "abc": appStateKey,
        },
    });

    const { state: reloadedState } = await useNeDBAuthState();

    const senderKeys = await reloadedState.keys.get("sender-key-memory", ["group-1"]);
    assert.deepEqual(senderKeys["group-1"], senderKeyMemory);

    const deviceLists = await reloadedState.keys.get("device-list", ["123@s.whatsapp.net"]);
    assert.deepEqual(deviceLists["123@s.whatsapp.net"], deviceList);

    const appStateKeys = await reloadedState.keys.get("app-state-sync-key", ["abc"]);
    const persistedKey = appStateKeys["abc"];
    assert.ok(persistedKey, "app-state-sync-key should persist");
    assert.equal(persistedKey.keyId, appStateKey.keyId);
    assert.deepEqual(Buffer.from(persistedKey.keyData ?? []), Buffer.from(appStateKey.keyData ?? []));

    await reloadedState.keys.set({
        "sender-key-memory": {
            "group-1": null,
        },
        "device-list": {
            "123@s.whatsapp.net": null,
        },
        "app-state-sync-key": {
            "abc": null,
        },
    });

    const { state: clearedState } = await useNeDBAuthState();

    const clearedSender = await clearedState.keys.get("sender-key-memory", ["group-1"]);
    assert.equal(clearedSender["group-1"], undefined);

    const clearedDevice = await clearedState.keys.get("device-list", ["123@s.whatsapp.net"]);
    assert.equal(clearedDevice["123@s.whatsapp.net"], undefined);

    const clearedAppState = await clearedState.keys.get("app-state-sync-key", ["abc"]);
    assert.equal(clearedAppState["abc"], undefined);

    await cleanCreds();
});

