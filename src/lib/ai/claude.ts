import "server-only";

// Shared Claude Messages API caller — Vibe, AI Sidekick, and AI Agents all
// need "send text, get text/JSON back," so this is the one place that talks
// to Anthropic; workflow-parser.ts keeps its own copy of this call inline
// since it predates this file and has slightly different validation needs,
// but any NEW AI Hub feature should call this instead of hand-rolling fetch.

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export type ClaudeResult = { ok: true; text: string } | { ok: false; error: string };

// Never throws — resolves {ok, error} like every other outbound call in this
// codebase (sendMail, DocuSign sends, integration executeAction).
export async function askClaude(system: string, userMessage: string, maxTokens = 1024): Promise<ClaudeResult> {
  if (!aiConfigured()) return { ok: false, error: "AI is not configured — add ANTHROPIC_API_KEY." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `AI request failed: ${res.status} ${text.slice(0, 300)}` };
    }
    const j = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = j.content.find((c) => c.type === "text")?.text ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Convenience for prompts that ask Claude to return strict JSON — strips
// markdown code fences if present, then parses. Callers still validate the
// parsed shape themselves (never trust it blindly).
export async function askClaudeForJson(system: string, userMessage: string, maxTokens = 1024):
  Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await askClaude(system, userMessage, maxTokens);
  if (!res.ok) return res;
  const cleaned = res.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch {
    return { ok: false, error: "AI returned an unparseable response." };
  }
}
