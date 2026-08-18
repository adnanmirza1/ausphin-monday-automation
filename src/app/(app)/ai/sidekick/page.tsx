import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiToolComingSoon } from "@/components/ai-hub/coming-soon";

export const dynamic = "force-dynamic";

export default async function SidekickPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AiToolComingSoon
      eyebrow="AI Hub"
      title="AI Sidekick"
      description="An in-context assistant that answers questions and takes quick actions on the board you're viewing — summarize an item, draft a status update, or suggest a next step."
      whatItWillDo={[
        "Answer questions about the current board's items and data",
        "Suggest and apply quick single-item actions (set status, draft a note)",
        "Open from any board via a floating trigger",
      ]}
    />
  );
}
