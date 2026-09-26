import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { user, account } from "@/db/schema";
import { eq, like, or, desc, asc, count } from "drizzle-orm";
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

export async function GET(request: NextRequest) {
  const session = await getValidSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Number(searchParams.get("offset")) || 0;
  const searchValue = searchParams.get("search") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDirection = (searchParams.get("sortDirection") || "desc") as "asc" | "desc";

  try {
    const conditions = searchValue
      ? or(like(user.name, `%${searchValue}%`), like(user.email, `%${searchValue}%`))
      : undefined;

    const [usersResult, totalResult] = await Promise.all([
      db
        .select()
        .from(user)
        .where(conditions)
        .orderBy(sortDirection === "desc" ? desc(user.createdAt) : asc(user.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(user)
        .where(conditions),
    ]);

    return NextResponse.json({
      users: usersResult,
      total: totalResult[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to list users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getValidSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, email, password, role } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: role || "user",
      createdAt: now,
      updatedAt: now,
    });

    if (password) {
      const hashed = await hashPassword(password);
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
        createdAt: now,
        updatedAt: now,
      });
    }

    const created = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .then((r) => r[0]);

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err: any) {
    const message = err.message?.includes("UNIQUE") ? "Email já está em uso" : err.message || "Failed to create user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
