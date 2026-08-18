import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { VibeDashboard } from "@/components/ai-hub/vibe-dashboard";
import { getVibeStatus, listFlaggedSentiment } from "@/app/actions/vibe";

export const dynamic = "force-dynamic";

export default async function VibePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ configured }, flagged] = await Promise.all([getVibeStatus(), listFlaggedSentiment()]);

  return <VibeDashboard configured={configured} flagged={flagged} />;
}
