"use server";

import { redirect } from "next/navigation";
import {
  loginWithPassword,
  destroySession,
  hashPassword,
  createSession,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { PALETTE } from "@/lib/constants";

export async function loginAction(
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "Enter your email and password.";

  const error = await loginWithPassword(email, password);
  if (error) return error;
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// Accept an invitation: create the account with the invited role, sign in.
export async function acceptInvite(
  token: string,
  _prev: string | null,
  formData: FormData
): Promise<string | null> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || password.length < 4)
    return "Enter your name and a password (min 4 characters).";

  const invite = await db.invitation.findUnique({ where: { token } });
  if (!invite || invite.status !== "pending") return "This invitation is no longer valid.";

  const existing = await db.user.findUnique({ where: { email: invite.email } });
  if (existing) return "An account with this email already exists — please sign in.";

  const role = invite.roleId
    ? await db.role.findUnique({ where: { id: invite.roleId } })
    : null;
  const roleName = role?.name ?? "Viewer";
  const user = await db.user.create({
    data: {
      orgId: invite.orgId,
      email: invite.email,
      name,
      passwordHash: await hashPassword(password),
      avatarColor: PALETTE[name.length % PALETTE.length],
      status: roleName === "Viewer" ? "viewer" : "active",
      roleId: invite.roleId,
    },
  });
  await db.invitation.update({ where: { id: invite.id }, data: { status: "accepted" } });
  await createSession(user.id);
  redirect("/");
}
