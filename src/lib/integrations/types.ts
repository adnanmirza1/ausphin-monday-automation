import "server-only";

// The reusable integration architecture: every provider (GitHub, GitLab,
// Slack, Jira, ...) implements this one shape. Adding a new provider means
// writing one file that satisfies ProviderConfig and registering it in
// registry.ts — no other file in the app needs to change (generic OAuth/
// API-key routes, Settings UI, and the automation engine all read this
// registry, not per-provider code).

export type ProviderAuthKind = "oauth2" | "api_key";

// A trigger this provider can fire (webhook-driven, like GitHub's
// "issue created") — automations reference it by triggerId.
export type ProviderTrigger = {
  id: string;
  label: string; // "When an issue is created"
  // If true, the automation builder shows a resource picker (repo, channel,
  // project...) sourced from listResources() below.
  needsResource?: boolean;
  resourceLabel?: string; // "Repository", "Channel", "Project"
};

// An action this provider can execute — automations reference it by actionId.
export type ProviderAction = {
  id: string;
  label: string; // "Create an issue"
  needsResource?: boolean;
  resourceLabel?: string;
  fields: { key: string; label: string; kind: "text" | "textarea"; placeholder?: string }[];
};

export type ProviderTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scope?: string;
};

export type ProviderAccountInfo = {
  label: string; // display name: GitHub login, Slack workspace, Jira site, ...
  meta?: Record<string, unknown>;
};

export type ExecResult = { ok: boolean; url?: string; error?: string };

export type ProviderConfig = {
  id: string; // "github", "gitlab", "slack", ...
  name: string; // display name
  authKind: ProviderAuthKind;
  // Env vars required to activate this provider — surfaced verbatim in the
  // "not configured" UI state so setup is self-documenting.
  requiredEnvVars: string[];
  docsHint: string; // one line: where to register the app / get the key

  configured(): boolean;

  // oauth2 providers only:
  buildAuthUrl?(redirectUri: string, state: string): string;
  exchangeCode?(code: string, redirectUri: string): Promise<ProviderTokens>;
  refreshToken?(refreshToken: string): Promise<ProviderTokens>;
  getAccountInfo?(accessToken: string): Promise<ProviderAccountInfo>;

  // api_key providers only: validates the key works and returns account info.
  verifyApiKey?(apiKey: string): Promise<ProviderAccountInfo>;

  triggers: ProviderTrigger[];
  actions: ProviderAction[];

  // Resources for the trigger/action picker (repos, channels, projects...).
  // Takes the stored credential (access token or api key).
  listResources?(credential: string): Promise<{ id: string; label: string }[]>;

  // Real API execution for one action. `fields` are the user-filled values
  // from ProviderAction.fields, already {{Placeholder}}-rendered by the
  // automation engine. `accountLabel` is the connected account's stored
  // display label (e.g. the PagerDuty user's email, required by their API's
  // From header) — providers that don't need it simply ignore the param.
  // Never throws — resolves {ok, error} like every other outbound call in
  // this codebase (sendMail, DocuSign sends).
  executeAction(
    credential: string,
    actionId: string,
    resource: string | undefined,
    fields: Record<string, string>,
    accountLabel: string
  ): Promise<ExecResult>;
};
