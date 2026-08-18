import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSidekickStatus } from "@/app/actions/sidekick";

export const dynamic = "force-dynamic";

export default async function SidekickPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { configured } = await getSidekickStatus();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">AI Hub</p>
        <h1 className="text-lg font-bold text-ink">AI Sidekick</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        {!configured && (
          <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
            Sidekick isn&rsquo;t configured yet — add <code className="font-mono">ANTHROPIC_API_KEY</code> in
            Settings to enable it.
          </div>
        )}
        <div className="mx-auto max-w-xl rounded-2xl border border-hair bg-white p-8 text-center shadow-soft">
          <p className="text-3xl">✦</p>
          <h2 className="mt-2 text-base font-bold text-ink">Sidekick lives on each item</h2>
          <p className="mt-2 text-sm text-body">
            Open any board, click an item, and use the &ldquo;AI Sidekick&rdquo; box in its detail panel to ask
            questions grounded in that item&rsquo;s real fields and recent updates — status, dates, notes,
            whatever&rsquo;s actually there.
          </p>
        </div>
      </div>
    </div>
  );
}
