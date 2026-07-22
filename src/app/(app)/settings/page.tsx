import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { SenderSettings } from "./sender-settings";

export const dynamic = "force-dynamic";

type Integration = {
  name: string;
  enables: string;
  configured: boolean;
  envVars: string[];
  note?: string;
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);
  if (!p.canManageUsers && !p.canManageEnvironments) redirect("/");

  const env = process.env;
  const integrations: Integration[] = [
    {
      name: "Google Sign-In",
      enables: "Company-email login via Google OAuth",
      configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      note: "Currently using email + password. Add credentials to enable Google.",
    },
    {
      name: "Stripe · Osphine PTY",
      enables: "Auto-generate & send invoices (offshore account)",
      configured: !!env.STRIPE_SECRET_KEY_PTY,
      envVars: ["STRIPE_SECRET_KEY_PTY"],
      note: "Without keys, invoices use a demo placeholder link.",
    },
    {
      name: "Stripe · Osphine Global",
      enables: "Auto-generate & send invoices (Dubai account)",
      configured: !!env.STRIPE_SECRET_KEY_GLOBAL,
      envVars: ["STRIPE_SECRET_KEY_GLOBAL"],
    },
    {
      name: "DocuSign (E-signature)",
      enables: "Send generated documents to candidates for external e-signature",
      configured: !!(
        env.DOCUSIGN_INTEGRATION_KEY &&
        env.DOCUSIGN_ACCOUNT_ID &&
        env.DOCUSIGN_SECRET
      ),
      envVars: ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_SECRET", "DOCUSIGN_BASE_URL"],
      note: "In-app signature pad works today; this adds external send-for-signature.",
    },
    {
      name: "Email (SMTP)",
      enables: "Outbound email — invoices, notifications",
      configured: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
      envVars: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
      note: "Until set, emails are logged and skipped (no failures).",
    },
    {
      name: "Reminders Cron",
      enables: "Daily date-reminder sweep at /api/cron/reminders",
      configured: !!env.CRON_SECRET,
      envVars: ["CRON_SECRET"],
      note: "Point a scheduler at the endpoint with a Bearer token.",
    },
  ];

  const ready = integrations.filter((i) => i.configured).length;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Configuration</p>
        <h1 className="text-lg font-bold text-ink">Integrations & Settings</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        <div className="mb-4 rounded-xl border border-hair bg-white p-4 shadow-soft">
          <p className="text-sm text-body">
            <b className="text-ink">{ready} of {integrations.length}</b> integrations configured.
            Add credentials as environment variables, then restart the app.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {integrations.map((i) => (
            <div key={i.name} className="rounded-xl border border-hair bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-ink">{i.name}</h3>
                  <p className="text-xs text-muted">{i.enables}</p>
                </div>
                <span
                  className="flex-none rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: i.configured ? "#2E9C63" : "#9AA4B2" }}
                >
                  {i.configured ? "Configured" : "Not set"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {i.envVars.map((v) => (
                  <code
                    key={v}
                    className="rounded bg-canvas px-2 py-0.5 font-mono text-[11px] text-body"
                  >
                    {v}
                  </code>
                ))}
              </div>
              {i.note && <p className="mt-2 text-xs text-muted">{i.note}</p>}
            </div>
          ))}
        </div>

        <SenderSettings smtpFrom={env.SMTP_FROM ?? null} />

        <p className="mt-4 text-xs text-muted">
          Tip: set these in <code className="font-mono">.env</code> (dev) or your host's
          environment (production). The app reads them at startup — the stubs already in
          place activate automatically once keys are present.
        </p>
      </div>
    </div>
  );
}
