// Money is stored as integer cents. Format for display.
export function formatMoney(cents: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// Parse a user-typed amount ("1,250.50") into integer cents.
export function parseMoney(input: string): number {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
