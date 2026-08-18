import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiToolComingSoon } from "@/components/ai-hub/coming-soon";

export const dynamic = "force-dynamic";

export default async function NotetakerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AiToolComingSoon
      eyebrow="AI Hub"
      title="AI Notetaker"
      description="Meeting and audio/text transcription with automatic summarization — attach a recording or paste notes, get a summary and action items linked back to the relevant item."
      whatItWillDo={[
        "Transcribe uploaded audio or pasted meeting notes",
        "Summarize into key points and action items",
        "Attach the summary to a board item and optionally trigger a follow-up automation",
      ]}
    />
  );
}
