"use client";

import { useEffect, useState, useTransition } from "react";
import { previewTemplate, generateDocumentDetailed, docuGenConversionAvailable } from "@/app/actions/docs";
import type { TemplateLite } from "@/components/board/docs-button";

type GenStage = "idle" | "mapping" | "converting" | "saving" | "done" | "error";

const STAGE_LABEL: Record<GenStage, string> = {
  idle: "",
  mapping: "Mapping data…",
  converting: "Converting PDF…",
  saving: "Saving file…",
  done: "Done.",
  error: "Failed.",
};

// Fix 1 (row-trigger upgrade): a dedicated slide-over that replaces the
// plain dropdown+"Generate" button in ItemPanel. Picking a docx template
// immediately renders a live preview (via the EXISTING previewTemplate()
// server action / renderTemplatePreview fill pipeline — same engine
// TemplateEditor's Preview tab already uses, see generate-doc.ts) before the
// user commits to generating a real, saved document.
export function DocuGenGenerateDrawer({
  boardId,
  itemId,
  itemName,
  templates,
  onClose,
  onGenerated,
}: {
  boardId: string;
  itemId: string;
  itemName: string;
  templates: TemplateLite[];
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [conversionAvailable, setConversionAvailable] = useState<boolean | null>(null);
  // Tagged by templateId so a stale in-flight preview for a previously
  // selected template can never overwrite the current selection's state —
  // and so the effect below never needs to setState synchronously at its
  // own start (it only sets state from the async .then/.catch callback).
  const [preview, setPreview] = useState<{ templateId: string; url: string | null; error: string | null } | null>(null);
  const [stage, setStage] = useState<GenStage>("idle");
  const [genMsg, setGenMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  const selected = templates.find((t) => t.id === templateId);
  const canPreview = selected?.kind === "docx";
  const previewForCurrent = preview?.templateId === templateId ? preview : null;
  const previewLoading = !previewForCurrent && !!templateId && canPreview && conversionAvailable !== false;
  const previewUrl = previewForCurrent?.url ?? null;
  const previewErr = previewForCurrent?.error ?? null;

  useEffect(() => {
    docuGenConversionAvailable().then(setConversionAvailable);
  }, []);

  useEffect(() => {
    if (!templateId || !canPreview || conversionAvailable === false) return;
    let cancelled = false;
    previewTemplate(boardId, itemId, templateId).then((res) => {
      if (cancelled) return;
      setPreview({
        templateId,
        url: res.ok ? res.dataUrl : null,
        error: res.ok ? null : res.error,
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, conversionAvailable]);

  function generate() {
    if (!templateId) return;
    setGenMsg(null);
    setStage("mapping");
    start(async () => {
      // Staged status messaging (Fix 3): generateDocumentDetailed is one
      // await, so the stages below are presented on a short timer rather
      // than driven by real server checkpoints — the server action doesn't
      // stream progress. They still communicate honestly: "Mapping data"
      // while the request is in flight, "Converting PDF" once we know the
      // template targets PDF output, "Saving" just before the result lands.
      const targetsPdf = selected?.kind === "docx"; // both docx outputs may convert; exact format is a template setting we don't have here, so this is the best available signal
      const t1 = setTimeout(() => targetsPdf && setStage("converting"), 700);
      const t2 = setTimeout(() => setStage("saving"), 1600);
      try {
        const result = await generateDocumentDetailed(boardId, itemId, templateId);
        clearTimeout(t1);
        clearTimeout(t2);
        if (result.ok) {
          setStage("done");
          setGenMsg({ text: "Document generated.", error: false });
          onGenerated();
          window.open(`/doc/${result.id}`, "_blank");
        } else {
          setStage("error");
          setGenMsg({ text: result.error, error: true });
        }
      } catch (e) {
        clearTimeout(t1);
        clearTimeout(t2);
        setStage("error");
        setGenMsg({ text: e instanceof Error ? e.message : "Generation failed.", error: true });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-pop animate-rise">
        <div className="flex items-center justify-between border-b border-hair px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">DocuGen</p>
            <h2 className="text-lg font-bold text-ink">Generate document — {itemName}</h2>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas" aria-label="Close">✕</button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* left: template picker + generate */}
          <div className="w-64 flex-none border-r border-hair p-4">
            <label className="mb-1 block text-xs font-semibold text-body">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-hair px-2.5 py-1.5 text-sm outline-none focus:border-teal"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <button
              onClick={generate}
              disabled={pending || !templateId}
              className="mt-3 w-full rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white hover:bg-teal-deep disabled:opacity-60 disabled:cursor-wait"
            >
              {pending ? "Generating…" : "Generate document"}
            </button>

            {pending && stage !== "idle" && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-teal border-t-transparent" />
                {STAGE_LABEL[stage]}
              </p>
            )}
            {genMsg && (
              <p className={`mt-2 text-xs font-medium ${genMsg.error ? "text-danger" : "text-grass"}`}>
                {genMsg.text}
              </p>
            )}

            {!canPreview && (
              <p className="mt-3 rounded-lg border border-dashed border-hair px-2.5 py-2 text-[11px] text-muted">
                Live preview is only available for .docx templates.
              </p>
            )}
          </div>

          {/* right: live preview */}
          <div className="min-w-0 flex-1 bg-canvas/30 p-4">
            {!canPreview ? (
              <div className="grid h-full place-items-center text-sm text-muted">
                Select a .docx template to see a live preview.
              </div>
            ) : conversionAvailable === false ? (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-amber">
                Live preview isn&rsquo;t configured yet — add a PDF conversion API key in Settings to enable it.
                You can still generate the document below.
              </div>
            ) : previewLoading ? (
              <PreviewSkeleton />
            ) : previewErr ? (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-danger">{previewErr}</div>
            ) : previewUrl ? (
              <iframe src={previewUrl} title="Live document preview" className="h-full w-full rounded-lg border border-hair bg-white" />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">No preview yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton (Fix 3) shown while the live preview renders.
function PreviewSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-hair bg-white p-6">
      <div className="h-4 w-1/3 animate-pulse rounded bg-canvas" />
      <div className="h-3 w-full animate-pulse rounded bg-canvas" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-canvas" />
      <div className="h-3 w-full animate-pulse rounded bg-canvas" />
      <div className="mt-4 h-3 w-1/4 animate-pulse rounded bg-canvas" />
      <div className="h-24 w-full animate-pulse rounded bg-canvas" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-canvas" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-canvas" />
    </div>
  );
}
