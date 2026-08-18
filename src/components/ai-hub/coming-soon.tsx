// Honest "not built yet" state for AI Hub tools not in this pass's scope
// (Sidekick, Vibe, AI Agents, Notetaker) — real route + nav entry so the
// sidebar matches the target menu, but no fake demo data or mocked results.
export function AiToolComingSoon({
  eyebrow,
  title,
  description,
  whatItWillDo,
}: {
  eyebrow: string;
  title: string;
  description: string;
  whatItWillDo: string[];
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-hair bg-white px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">{eyebrow}</p>
        <h1 className="text-lg font-bold text-ink">{title}</h1>
      </header>

      <div className="flex-1 overflow-auto scroll-thin p-4 sm:p-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-hair bg-white p-8 text-center shadow-soft">
          <p className="text-3xl">✦</p>
          <h2 className="mt-2 text-base font-bold text-ink">Not built yet</h2>
          <p className="mt-2 text-sm text-body">{description}</p>
          <div className="mt-5 rounded-xl bg-canvas px-4 py-3 text-left">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              What this will do
            </p>
            <ul className="grid gap-1 text-sm text-body">
              {whatItWillDo.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-teal">·</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
