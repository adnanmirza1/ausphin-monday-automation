import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocViewer } from "./doc-viewer";

export const dynamic = "force-dynamic";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const doc = await db.generatedDocument.findUnique({
    where: { id },
    include: { item: { include: { board: { include: { environment: true } } } } },
  });
  if (!doc || doc.item.board.environment.orgId !== user.orgId) notFound();

  return <DocViewer id={doc.id} name={doc.name} html={doc.html} />;
}
