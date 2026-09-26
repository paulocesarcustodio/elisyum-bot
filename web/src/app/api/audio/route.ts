import { db } from "@/db";
import { savedAudios } from "@/db/schema";
import { eq, like, desc, count, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const audioStoragePath = path.resolve(
  process.cwd(),
  process.env.AUDIO_STORAGE_PATH || "../storage/audios"
);

async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search") || "";
  const offset = (page - 1) * limit;

  const where = search ? like(savedAudios.audioName, `%${search}%`) : undefined;

  const total = await db
    .select({ count: count() })
    .from(savedAudios)
    .where(where);

  const audios = await db
    .select()
    .from(savedAudios)
    .where(where)
    .orderBy(desc(savedAudios.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    audios,
    total: total[0]?.count ?? 0,
    page,
    totalPages: Math.ceil((total[0]?.count ?? 0) / limit),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const audioName = formData.get("name") as string | null;

  if (!file || !audioName) {
    return NextResponse.json({ error: "File and name are required" }, { status: 400 });
  }

  const name = audioName.toLowerCase().trim();
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = crypto.createHash("md5").update(buffer).digest("hex");

  if (!fs.existsSync(audioStoragePath)) {
    fs.mkdirSync(audioStoragePath, { recursive: true });
  }

  const existing = await db
    .select()
    .from(savedAudios)
    .where(eq(savedAudios.audioName, name));

  if (existing.length > 0) {
    return NextResponse.json({ error: "Audio name already exists" }, { status: 409 });
  }

  const tmpPath = path.join(audioStoragePath, `${hash}_tmp`);
  fs.writeFileSync(tmpPath, buffer);

  const fileName = `${hash}.mp3`;
  const filePath = path.join(audioStoragePath, fileName);

  let seconds: number | null = null;
  try {
    execSync(
      `ffmpeg -y -i "${tmpPath}" -codec:a libmp3lame -qscale:a 2 -write_xing 1 "${filePath}"`,
      { timeout: 30000 }
    );
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { timeout: 10000 }
    ).toString().trim();
    const parsed = parseFloat(output);
    if (!isNaN(parsed)) seconds = Math.round(parsed);
  } catch {
    fs.copyFileSync(tmpPath, filePath);
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }

  await db.insert(savedAudios).values({
    ownerJid: `admin:${session.user.id}`,
    audioName: name,
    filePath,
    mimeType: 'audio/mpeg',
    seconds,
    ptt: 0,
  });

  return NextResponse.json({ success: true, name, filePath, seconds });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const audio = await db
    .select()
    .from(savedAudios)
    .where(eq(savedAudios.audioName, name.toLowerCase()))
    .get();

  if (!audio) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  try {
    if (fs.existsSync(audio.filePath)) {
      fs.unlinkSync(audio.filePath);
    }
  } catch {}

  await db
    .delete(savedAudios)
    .where(eq(savedAudios.audioName, name.toLowerCase()));

  return NextResponse.json({ success: true });
}
