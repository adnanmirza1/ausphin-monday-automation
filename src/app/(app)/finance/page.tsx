import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { db } from "@/lib/db";
import { FinancePanel } from "@/components/finance/finance-panel";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);
  const isAdmin = !!(p.canManageUsers || p.canManageEnvironments);

  const [invoices, departments] = await Promise.all([
    db.invoice.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" } }),
    db.department.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <FinancePanel
      isAdmin={isAdmin}
      readOnly={!!p.readOnly}
      departments={departments}
      invoices={invoices.map((i) => ({
        id: i.id,
        account: i.account,
        candidateName: i.candidateName,
        candidateEmail: i.candidateEmail,
        amountCents: i.amountCents,
        currency: i.currency,
        description: i.description,
        department: i.department,
        status: i.status,
        paymentMethod: i.paymentMethod,
        stripeUrl: i.stripeUrl,
      }))}
    />
  );
}
