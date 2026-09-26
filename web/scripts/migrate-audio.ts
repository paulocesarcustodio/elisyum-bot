import { db } from "@/db";
import { savedAudios } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const audioStoragePath = path.resolve(
  process.cwd(),
  process.env.AUDIO_STORAGE_PATH || "../storage/audios"
);

async function migrate() {
  if (!fs.existsSync(audioStoragePath)) {
    console.log("Storage path not found:", audioStoragePath);
    return;
  }

  const allAudios = await db.select().from(savedAudios);
  let converted = 0;
  let failed = 0;

  for (const audio of allAudios) {
    const ext = path.extname(audio.filePath).toLowerCase();
    if (ext === ".mp3") continue;

    const oldPath = audio.filePath;
    if (!fs.existsSync(oldPath)) {
      console.log(`  File not found: ${oldPath}`);
      continue;
    }

    const newPath = oldPath.replace(ext, ".mp3");
    if (fs.existsSync(newPath)) {
      console.log(`  Already converted: ${audio.audioName}`);
      continue;
    }

    console.log(`  Converting: ${audio.audioName} (${ext})`);

    try {
      execSync(
        `ffmpeg -y -i "${oldPath}" -codec:a libmp3lame -qscale:a 2 -write_xing 1 "${newPath}"`,
        { timeout: 60000 }
      );

      const output = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${newPath}"`,
        { timeout: 10000 }
      ).toString().trim();
      const seconds = parseFloat(output);
      const duration = !isNaN(seconds) ? Math.round(seconds) : null;

      await db
        .update(savedAudios)
        .set({ filePath: newPath, mimeType: "audio/mpeg", seconds: duration })
        .where(eq(savedAudios.id, audio.id));

      fs.unlinkSync(oldPath);
      converted++;
      console.log(`    Done - ${duration ? duration + "s" : "unknown duration"}`);
    } catch (err) {
      console.log(`    Failed: ${err}`);
      failed++;
    }
  }

  console.log(`\nComplete: ${converted} converted, ${failed} failed`);
}

migrate().catch(console.error);
