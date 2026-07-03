import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const COOKIE = "oswin_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000);
  await db.session.create({ data: { userId, token, expiresAt } });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { token } });
  store.delete(COOKIE);
}

// Returns the signed-in user (with role, department, org) or null.
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: { include: { role: true, department: true, org: true } },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === "inactive") return null;
  return session.user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Verify email + password, create a session. Returns error string or null.
export async function loginWithPassword(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) return "Invalid email or password.";
  if (user.status === "inactive")
    return "This account is inactive. Contact an administrator.";
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return "Invalid email or password.";
  await createSession(user.id);
  return null;
}
