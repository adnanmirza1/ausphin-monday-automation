import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { StatusLabel } from "@/lib/constants";
import { PublicForm, type FormField } from "@/app/form/[boardId]/public-form";

export const dynamic = "force-dynamic";

const FORM_TYPES = ["text", "longtext", "status", "date", "number", "email", "phone", "signature"];

// Short public link /f/<slug> → a named Form, or a legacy board form.
export default async function ShortFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // 1) Named form?
  const form = await db.form.findUnique({ where: { slug } });
  if (form) {
    if (!form.enabled) notFound();
    const board = await db.board.findUnique({
      where: { id: form.boardId },
      include: { columns: { orderBy: { position: "asc" } } },
    });
    if (!board) notFound();
    let cfg: { columns?: string[]; appearance?: import("@/lib/board-types").FormAppearance } = {};
    try {
      cfg = JSON.parse(form.config);
    } catch {}
    const includedIds = cfg.columns ?? [];
    const fields: FormField[] = board.columns
      .filter((c) => includedIds.includes(c.id) && FORM_TYPES.includes(c.type))
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
        formId={form.id}
        title={form.title || board.name}
        desc={form.desc}
        fields={fields}
        appearance={cfg.appearance}
      />
    );
  }

  // 2) Legacy board form slug → the board's single form page.
  const board = await db.board.findUnique({
    where: { formSlug: slug },
    select: { id: true, formEnabled: true },
  });
  if (!board || !board.formEnabled) notFound();
  redirect(`/form/${board.id}`);
}
