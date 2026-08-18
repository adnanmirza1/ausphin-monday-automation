import "server-only";
import type { ProviderConfig } from "./types";

// CircleCI uses a personal API token, not OAuth — the user pastes it in
// (Settings → "Connect" prompts for the key instead of redirecting).
export const circleci: ProviderConfig = {
  id: "circleci",
  name: "CircleCI",
  authKind: "api_key",
  requiredEnvVars: [],
  docsHint: "Create a Personal API Token at app.circleci.com/settings/user/tokens, then paste it in when connecting",

  configured() {
    return true; // api_key providers are always "configured" — connecting just needs the user's key
  },

  async verifyApiKey(apiKey) {
    const res = await fetch("https://circleci.com/api/v2/me", {
      headers: { "Circle-Token": apiKey },
    });
    if (!res.ok) throw new Error(`Invalid CircleCI token (${res.status})`);
    const j = (await res.json()) as { login: string; name?: string };
    return { label: j.login, meta: { name: j.name ?? j.login } };
  },

  async listResources(apiKey) {
    const res = await fetch("https://circleci.com/api/v2/me/collaborations", {
      headers: { "Circle-Token": apiKey },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { vcs_type: string; slug: string }[];
    return j.map((o) => ({ id: o.slug, label: o.slug }));
  },

  triggers: [],

  actions: [
    {
      id: "trigger_pipeline",
      label: "Trigger a pipeline",
      needsResource: true,
      resourceLabel: "Project slug (e.g. gh/org/repo)",
      fields: [{ key: "branch", label: "Branch", kind: "text", placeholder: "main" }],
    },
  ],

  async executeAction(apiKey, actionId, resource, fields) {
    if (actionId !== "trigger_pipeline") return { ok: false, error: `unknown action "${actionId}"` };
    if (!resource) return { ok: false, error: "no project slug given" };
    try {
      const res = await fetch(`https://circleci.com/api/v2/project/${resource}/pipeline`, {
        method: "POST",
        headers: { "Circle-Token": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ branch: fields.branch || "main" }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `CircleCI API ${res.status}: ${text.slice(0, 300)}` };
      }
      await res.json(); // pipeline id acknowledged; CircleCI's dashboard URL is stable per-project
      return { ok: true, url: `https://app.circleci.com/pipelines/${resource}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
