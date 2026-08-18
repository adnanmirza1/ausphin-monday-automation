import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { permsOf } from "@/lib/guard";
import { AgentsDashboard } from "@/components/ai-hub/agents-dashboard";
import { getAgentsStatus, listAgents, listAllowedToolTypes } from "@/app/actions/ai-agents";
import { listWorkflowBoards } from "@/app/actions/ai-workflows";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = permsOf(user);

  const [{ configured }, agents, boards, toolTypes] = await Promise.all([
    getAgentsStatus(),
    listAgents(),
    listWorkflowBoards(),
    listAllowedToolTypes(),
  ]);

  return (
    <AgentsDashboard
      configured={configured}
      agents={agents}
      boards={boards}
      toolTypes={toolTypes}
      canManage={!!(p.canManageUsers || p.canManageEnvironments)}
    />
  );
}
