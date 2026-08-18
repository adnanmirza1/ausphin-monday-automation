import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiWorkflowsDashboard } from "@/components/ai-hub/ai-workflows-dashboard";
import { getAiWorkflowsStatus, listWorkflowBoards } from "@/app/actions/ai-workflows";

export const dynamic = "force-dynamic";

export default async function AiWorkflowsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ configured }, boards] = await Promise.all([getAiWorkflowsStatus(), listWorkflowBoards()]);

  return <AiWorkflowsDashboard configured={configured} boards={boards} />;
}
