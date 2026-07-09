import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Short public form link: /f/<slug> → resolves to the board's public form.
export default async function ShortFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const board = await db.board.findUnique({
    where: { formSlug: slug },
    select: { id: true, formEnabled: true },
  });
  if (!board || !board.formEnabled) notFound();
  redirect(`/form/${board.id}`);
}
