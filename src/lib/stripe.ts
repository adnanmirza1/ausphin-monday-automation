import "server-only";

// Two Stripe accounts (Part 17): Osphine PTY (offshore) and Osphine Global (Dubai).
// Real integration needs secret keys per account — set these when available:
//   STRIPE_SECRET_KEY_PTY / STRIPE_SECRET_KEY_GLOBAL
// Until then we generate a deterministic placeholder invoice so the whole
// intake → approve → invoice → paid flow is exercisable end-to-end.

export type StripeAccount = "pty" | "global";

export const STRIPE_ACCOUNTS: Record<StripeAccount, { label: string; region: string }> = {
  pty: { label: "Osphine PTY", region: "Australia (offshore)" },
  global: { label: "Osphine Global", region: "Dubai" },
};

export function isStripeConfigured(account: StripeAccount): boolean {
  const key =
    account === "pty"
      ? process.env.STRIPE_SECRET_KEY_PTY
      : process.env.STRIPE_SECRET_KEY_GLOBAL;
  return !!key;
}

export type CreatedInvoice = { id: string; url: string; number: string };

// Create a Stripe invoice for the given account. Falls back to a placeholder
// when keys are not configured (dev/demo). Swap the placeholder branch for the
// real Stripe SDK call once STRIPE_SECRET_KEY_* is set.
export async function createStripeInvoice(params: {
  account: StripeAccount;
  candidateEmail: string;
  candidateName: string;
  amountCents: number;
  currency: string;
  description: string;
}): Promise<CreatedInvoice> {
  if (isStripeConfigured(params.account)) {
    // TODO: real Stripe call, e.g.
    //   const stripe = new Stripe(key)
    //   const customer = await stripe.customers.create({ email, name })
    //   const item = await stripe.invoiceItems.create({ customer, amount, currency, description })
    //   const inv = await stripe.invoices.create({ customer, auto_advance: true })
    //   const sent = await stripe.invoices.sendInvoice(inv.id)
    //   return { id: sent.id, url: sent.hosted_invoice_url, number: sent.number }
    throw new Error("Stripe keys present but live integration not wired yet.");
  }

  // Placeholder (deterministic-ish) invoice.
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const prefix = params.account === "pty" ? "PTY" : "GLB";
  const number = `${prefix}-${rand}`;
  return {
    id: `in_demo_${rand}`,
    url: `https://invoice.stripe.com/demo/${number}`,
    number,
  };
}
