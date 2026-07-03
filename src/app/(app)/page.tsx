import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getNav } from "@/lib/queries";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = await getNav(user.orgId);
  const firstBoard = nav.flatMap((e) => e.boards)[0];
  if (firstBoard) redirect(`/boards/${firstBoard.id}`);

  return (
    <div className="grid h-full place-items-center p-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-ink">Welcome to Oswin Work OS</h1>
        <p className="mt-2 text-muted">
          No boards yet. Create your first board to get started.
        </p>
      </div>
    </div>
  );
}
