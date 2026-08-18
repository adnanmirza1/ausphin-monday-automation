import "server-only";
import type { ProviderConfig } from "./types";

// PagerDuty uses a REST API key (Settings → API Access in PagerDuty).
export const pagerduty: ProviderConfig = {
  id: "pagerduty",
  name: "PagerDuty",
  authKind: "api_key",
  requiredEnvVars: [],
  docsHint: "Create a REST API key in PagerDuty under Integrations → API Access Keys, then paste it in when connecting",

  configured() {
    return true;
  },

  async verifyApiKey(apiKey) {
    const res = await fetch("https://api.pagerduty.com/users/me", {
      headers: { Authorization: `Token token=${apiKey}`, Accept: "application/vnd.pagerduty+json;version=2" },
    });
    if (!res.ok) throw new Error(`Invalid PagerDuty key (${res.status})`);
    const j = (await res.json()) as { user: { name: string; email: string } };
    return { label: j.user.email, meta: { name: j.user.name } };
  },

  async listResources(apiKey) {
    const res = await fetch("https://api.pagerduty.com/services?limit=100", {
      headers: { Authorization: `Token token=${apiKey}`, Accept: "application/vnd.pagerduty+json;version=2" },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { services: { id: string; name: string }[] };
    return j.services.map((s) => ({ id: s.id, label: s.name }));
  },

  triggers: [],

  actions: [
    {
      id: "trigger_incident",
      label: "Trigger an incident",
      needsResource: true,
      resourceLabel: "Service",
      fields: [
        { key: "title", label: "Title", kind: "text", placeholder: "e.g. Escalation: {{Item}}" },
        { key: "body", label: "Details", kind: "textarea", placeholder: "Incident details (optional)" },
      ],
    },
  ],

  async executeAction(apiKey, actionId, resource, fields, accountLabel) {
    if (actionId !== "trigger_incident") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource) return { ok: false, error: "no service selected" };
    if (!accountLabel) return { ok: false, error: "no connected PagerDuty user email on record — reconnect PagerDuty" };
    try {
      const res = await fetch("https://api.pagerduty.com/incidents", {
        method: "POST",
        headers: {
          Authorization: `Token token=${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.pagerduty+json;version=2",
          From: accountLabel,
        },
        body: JSON.stringify({
          incident: {
            type: "incident",
            title: fields.title || "(untitled incident)",
            service: { id: resource, type: "service_reference" },
            body: fields.body ? { type: "incident_body", details: fields.body } : undefined,
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `PagerDuty API ${res.status}: ${text.slice(0, 300)}` };
      }
      const j = (await res.json()) as { incident: { html_url: string } };
      return { ok: true, url: j.incident.html_url };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
