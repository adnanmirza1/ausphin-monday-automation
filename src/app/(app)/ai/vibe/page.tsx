import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiToolComingSoon } from "@/components/ai-hub/coming-soon";

export const dynamic = "force-dynamic";

export default async function VibePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AiToolComingSoon
      eyebrow="AI Hub"
      title="Vibe"
      description="Tone and sentiment analysis across updates, emails, and candidate feedback — surfaced as a score and flagged for follow-up when something reads negative."
      whatItWillDo={[
        "Score sentiment on item updates, emails, and notes",
        "Flag negative-trending threads for review",
        "Feed a sentiment column/widget onto boards and the dashboard",
      ]}
    />
  );
}
