import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NotetakerDashboard } from "@/components/ai-hub/notetaker-dashboard";
import { getNotetakerStatus, listNotetakerSessions } from "@/app/actions/notetaker";

export const dynamic = "force-dynamic";

export default async function NotetakerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [status, sessions] = await Promise.all([getNotetakerStatus(), listNotetakerSessions()]);

  return <NotetakerDashboard status={status} sessions={sessions} />;
}
