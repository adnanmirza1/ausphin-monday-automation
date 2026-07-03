import { db } from "@/lib/db";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await db.invitation.findUnique({
    where: { token },
    include: { org: true },
  });
  const role =
    invite?.roleId != null
      ? await db.role.findUnique({ where: { id: invite.roleId } })
      : null;

  const invalid = !invite || invite.status !== "pending";

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-t-2xl bg-rail px-6 py-5 text-white">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/50">
            Oswin Work OS
          </p>
          <h1 className="mt-1 text-xl font-bold">
            {invalid ? "Invitation" : `Join ${invite!.org.name}`}
          </h1>
        </div>
        <div className="rounded-b-2xl border border-t-0 border-hair bg-white p-6 shadow-soft">
          {invalid ? (
            <p className="text-sm text-muted">
              This invitation is invalid, already used, or was revoked. Ask an admin to
              re-send it.
            </p>
          ) : (
            <>
              <p className="text-sm text-body">
                You've been invited as <b className="text-ink">{invite!.email}</b> with the{" "}
                <b className="text-ink">{role?.name ?? "Viewer"}</b> role.
              </p>
              <InviteForm token={token} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
