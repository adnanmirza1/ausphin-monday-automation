import { db } from "@/lib/db";
import type { StatusLabel } from "@/lib/constants";
import { PublicForm, type FormField } from "./public-form";

// Public form must always reflect the current config (dynamic, not prerendered).
export const dynamic = "force-dynamic";

export default async function FormPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const board = await db.board.findUnique({
    where: { id: boardId },
    include: { columns: { orderBy: { position: "asc" } } },
  });

  if (!board || !board.formEnabled) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="text-center">
          <h1 className="text-lg font-bold text-ink">Form unavailable</h1>
          <p className="mt-1 text-sm text-muted">This form is not currently accepting responses.</p>
        </div>
      </div>
    );
  }

  let cfg: { columns?: string[]; appearance?: import("@/lib/board-types").FormAppearance } = {};
  try {
    cfg = JSON.parse(board.formConfig);
  } catch {}
  const includedIds = cfg.columns ?? [];

  const FORM_TYPES = ["text", "longtext", "status", "date", "number", "email", "phone", "signature"];
  const fields: FormField[] = board.columns
    .filter((c) => includedIds.includes(c.id))
    .filter((c) => FORM_TYPES.includes(c.type))
    .map((c) => {
      let labels: StatusLabel[] = [];
      if (c.type === "status") {
        try {
          labels = JSON.parse(c.config).labels ?? [];
        } catch {}
      }
      return { id: c.id, name: c.name, type: c.type, labels };
    });

  return (
    <PublicForm
      boardId={board.id}
      title={board.formTitle || board.name}
      desc={board.formDesc}
      fields={fields}
      appearance={cfg.appearance}
    />
  );
}
