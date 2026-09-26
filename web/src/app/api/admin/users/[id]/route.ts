import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user, account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@better-auth/utils/password";

const API_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

async function getValidSession(request: NextRequest) {
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie: request.headers.get("cookie") || "" },
  });
  if (!res.ok) return null;
  const session = await res.json();
  if (!session?.user) return null;
  return session;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getValidSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const now = new Date().toISOString();

    const updates: Record<string, any> = { updatedAt: now };

    if (body.name) updates.name = body.name;
    if (body.email) updates.email = body.email;
    if (body.role) updates.role = body.role;
    if (body.banned !== undefined) updates.banned = body.banned;
    if (body.banReason !== undefined) updates.banReason = body.banReason;

    if (Object.keys(updates).length > 1) {
      await db.update(user).set(updates).where(eq(user.id, id));
    }

    if (body.password) {
      const hashed = await hashPassword(body.password);
      const existing = await db
        .select()
        .from(account)
        .where(eq(account.userId, id))
        .then((r) => r[0]);

      if (existing) {
        await db
          .update(account)
          .set({ password: hashed, updatedAt: now })
          .where(eq(account.userId, id));
      } else {
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: id,
          providerId: "credential",
          userId: id,
          password: hashed,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const updated = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .then((r) => r[0]);

    return NextResponse.json({ user: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { status: Number(err.statusCode) || 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getValidSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    await db.delete(account).where(eq(account.userId, id));
    await db.delete(user).where(eq(user.id, id));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
