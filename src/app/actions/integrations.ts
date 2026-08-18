"use server";

import { db } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/guard";
import { getProvider, listProviders } from "@/lib/integrations/registry";
import type { ProviderTrigger, ProviderAction } from "@/lib/integrations/types";

// Generic status shape reused across every provider — the Settings UI
// renders one card per registry entry using this same contract, so adding a
// new provider means adding a registry entry, not a new UI pattern.
export type IntegrationStatus = {
  provider: string;
  name: string;
  authKind: "oauth2" | "api_key";
  configured: boolean;
  connected: boolean;
  accountLabel: string;
  requiredEnvVars: string[];
  docsHint: string;
};

export async function listIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const user = await requireUser();
  const conns = await db.connectedIntegration.findMany({
    where: { orgId: user.orgId },
    select: { provider: true, accountLabel: true },
  });
  const connMap = new Map(conns.map((c) => [c.provider, c.accountLabel]));
  return listProviders().map((p) => ({
    provider: p.id,
    name: p.name,
    authKind: p.authKind,
    configured: p.configured(),
    connected: connMap.has(p.id),
    accountLabel: connMap.get(p.id) ?? "",
    requiredEnvVars: p.requiredEnvVars,
    docsHint: p.docsHint,
  }));
}

export async function getIntegrationStatus(provider: string): Promise<IntegrationStatus | null> {
  const all = await listIntegrationStatuses();
  return all.find((s) => s.provider === provider) ?? null;
}

// Connect a provider that authenticates with a pasted API key/token instead
// of OAuth (CircleCI, PagerDuty, ...) — validates the key against the real
// API before storing it, never accepts an unverified key.
export async function connectWithApiKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAdmin();
  const p = getProvider(provider);
  if (!p || p.authKind !== "api_key" || !p.verifyApiKey) return { ok: false, error: "not an API-key provider" };
  if (!apiKey.trim()) return { ok: false, error: "API key is required" };
  try {
    const info = await p.verifyApiKey(apiKey.trim());
    await db.connectedIntegration.upsert({
      where: { orgId_provider: { orgId: user.orgId, provider } },
      create: {
        orgId: user.orgId,
        userId: user.id,
        provider,
        accountLabel: info.label,
        accountMeta: JSON.stringify(info.meta ?? {}),
        accessToken: apiKey.trim(),
      },
      update: {
        userId: user.id,
        accountLabel: info.label,
        accountMeta: JSON.stringify(info.meta ?? {}),
        accessToken: apiKey.trim(),
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectIntegration(provider: string): Promise<void> {
  const admin = await requireAdmin();
  await db.connectedIntegration.deleteMany({ where: { orgId: admin.orgId, provider } });
}

// Resources (repos/channels/projects) for the automation builder's picker.
export async function listIntegrationResources(provider: string): Promise<{ id: string; label: string }[]> {
  const user = await requireUser();
  const p = getProvider(provider);
  if (!p?.listResources) return [];
  const conn = await db.connectedIntegration.findUnique({
    where: { orgId_provider: { orgId: user.orgId, provider } },
    select: { accessToken: true },
  });
  if (!conn?.accessToken) return [];
  try {
    return await p.listResources(conn.accessToken);
  } catch {
    return [];
  }
}

// Registry metadata for the automation builder's trigger/action pickers —
// which connected providers offer triggers/actions, and what fields each
// action needs.
export type ProviderCapabilities = {
  provider: string;
  name: string;
  triggers: ProviderTrigger[];
  actions: ProviderAction[];
};

export async function listConnectedProviderCapabilities(): Promise<ProviderCapabilities[]> {
  const user = await requireUser();
  const conns = await db.connectedIntegration.findMany({ where: { orgId: user.orgId }, select: { provider: true } });
  return conns
    .map((c) => getProvider(c.provider))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ provider: p.id, name: p.name, triggers: p.triggers, actions: p.actions }));
}
