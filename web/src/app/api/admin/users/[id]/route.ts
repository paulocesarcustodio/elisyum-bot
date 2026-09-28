import { requireSession } from '@/lib/access';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user, account } from "@/db/schema";
import { eq } from "@/db/expressions";
import { hashPassword } from "@better-auth/utils/password";

async function getValidSession(request: NextRequest) {
  try { return await requireSession(request); } catch { return null; }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getValidSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito à administração.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    if(body.role !== undefined && !['user','admin'].includes(body.role))return NextResponse.json({error:'Perfil inválido.'},{status:400});
    if(body.password && (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128))return NextResponse.json({error:'A senha deve ter de 10 a 128 caracteres.'},{status:400});
    const now = new Date();

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
      { error: "Não foi possível atualizar o usuário" },
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
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito à administração.' }, { status: 403 });
  }

  try {
    const { id } = await params;

    await db.delete(account).where(eq(account.userId, id));
    await db.delete(user).where(eq(user.id, id));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Não foi possível excluir o usuário" },
      { status: 500 }
    );
  }
}
