import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiToolComingSoon } from "@/components/ai-hub/coming-soon";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AiToolComingSoon
      eyebrow="AI Hub"
      title="AI Agents"
      description="Custom autonomous agents for specialized, multi-step tasks — beyond single trigger→action rules, an agent can plan and carry out a sequence of steps toward a goal you describe."
      whatItWillDo={[
        "Define an agent's goal, tools, and guardrails",
        "Let it plan and execute multi-step tasks across boards and connected integrations",
        "Review its run history and approve sensitive steps",
      ]}
    />
  );
}
