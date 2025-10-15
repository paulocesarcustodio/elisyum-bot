import test from "node:test"
import assert from "node:assert/strict"

import { extractImageThumb, getAudioWaveform } from "@whiskeysockets/baileys/lib/Utils/messages-media.js"

const SAMPLE_IMAGE = "src/media/cara.png"

function createTestWav(durationSeconds = 1, sampleRate = 8000): Buffer {
    const numSamples = durationSeconds * sampleRate
    const header = Buffer.alloc(44)
    const subchunk2Size = numSamples * 2

    header.write("RIFF", 0)
    header.writeUInt32LE(36 + subchunk2Size, 4)
    header.write("WAVE", 8)
    header.write("fmt ", 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(sampleRate * 2, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write("data", 36)
    header.writeUInt32LE(subchunk2Size, 40)

    const data = Buffer.alloc(subchunk2Size)
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate
        const amplitude = Math.sin(2 * Math.PI * 440 * t)
        const sample = Math.max(-1, Math.min(1, amplitude))
        data.writeInt16LE(Math.round(sample * 0x7fff), i * 2)
    }

    return Buffer.concat([header, data])
}

test("extractImageThumb usa sharp para gerar miniaturas de figurinhas", async () => {
    const { buffer, original } = await extractImageThumb(SAMPLE_IMAGE, 64)

    assert.ok(original.width && original.height, "dimensões originais devem ser detectadas")
    assert.equal(buffer.length > 0, true, "thumbnail precisa ser gerado")
})

test("getAudioWaveform depende de audio-decode para gerar 64 amostras", async () => {
    const waveform = await getAudioWaveform(createTestWav())

    assert.ok(waveform, "waveform deve ser retornado")
    assert.equal(waveform?.length, 64)
    if (waveform) {
        const values = Array.from(waveform)
        assert.ok(values.every((value) => value >= 0 && value <= 100), "valores devem estar normalizados entre 0 e 100")
    }
})
