import { db } from "@/db";
import { savedAudios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const { newName } = await request.json();

  if (!newName) {
    return NextResponse.json({ error: "newName is required" }, { status: 400 });
  }

  const audio = await db
    .select()
    .from(savedAudios)
    .where(eq(savedAudios.audioName, name.toLowerCase()))
    .get();

  if (!audio) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  const existing = await db
    .select()
    .from(savedAudios)
    .where(eq(savedAudios.audioName, newName.toLowerCase()))
    .get();

  if (existing) {
    return NextResponse.json({ error: "New name already exists" }, { status: 409 });
  }

  await db
    .update(savedAudios)
    .set({ audioName: newName.toLowerCase() })
    .where(eq(savedAudios.audioName, name.toLowerCase()));

  return NextResponse.json({ success: true, newName: newName.toLowerCase() });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;

  const audio = await db
    .select()
    .from(savedAudios)
    .where(eq(savedAudios.audioName, name.toLowerCase()))
    .get();

  if (!audio) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  if (!fs.existsSync(audio.filePath)) {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(audio.filePath);
  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": audio.mimeType,
      "Content-Disposition": `inline; filename="${audio.audioName}${path.extname(audio.filePath)}"`,
    },
  });
}
